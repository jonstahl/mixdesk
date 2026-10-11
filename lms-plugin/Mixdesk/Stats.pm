package Plugins::Mixdesk::Stats;

# Read-only queries over the tables TrackStat keeps in LMS's persistent
# database: track_history (one row per play) and track_statistics (play
# count, last played and rating per track).
#
# Everything joins to `tracks` by URL, so history for files LMS no longer
# has is left out rather than counted against nothing.
#
# A rating is TrackStat's own 0-100 value. It shows stars as
# floor((rating + 10) / 20), so 70 and up is 4 stars or better ("loved") and
# anything under 10 is unrated.
#
# These take a plain DBI handle so they can run without LMS (see the test
# harness in the repository's history); Plugin.pm adapts them to CLI queries.

use strict;
use warnings;

use constant DAY => 86400;
use constant LOVED => 70;
use constant RATED => 10;

# The calendar always shows the last 53 weeks, whatever range is chosen.
use constant CALENDAR_DAYS => 53 * 7 + 7;

# DBD::SQLite binds plain numbers as text, which is fine when they're compared
# to a column (it applies the column's affinity) but not to an expression,
# where any integer sorts below any text. Cast in those places.
sub _since {
	my ($days, $now) = @_;
	return $days > 0 ? $now - $days * DAY : 0;
}

# Strings come back from SQLite as bytes (title is a BLOB column), but JSON
# encoding wants characters, so decode what hasn't been decoded already.
sub _text {
	my $s = shift;
	return '' unless defined $s;
	utf8::decode($s) unless utf8::is_utf8($s);
	return $s;
}

# True when TrackStat's tables exist and have any history in them.
sub history {
	my $dbh = shift;
	my ($n) = $dbh->selectrow_array('SELECT COUNT(*) FROM persistentdb.track_history');
	return $n ? 1 : 0;
}

=head2 summary($dbh, days => N, tz => SECONDS, now => EPOCH)

The figures and charts for the Stats page. `days` is the range (0 for all
time) and `tz` the viewer's offset east of UTC in seconds, so plays land on
the viewer's calendar days.

=cut

sub summary {
	my ($dbh, %o) = @_;
	my ($days, $tz, $now) = ($o{days} || 0, $o{tz} || 0, $o{now} || time());
	my $since = _since($days, $now);
	my %r;

	my $joined = 'FROM persistentdb.track_history h JOIN tracks t ON t.url = h.url WHERE h.played > 0 AND h.played >= ?';

	@r{qw(plays tracks artists active_days first)} = $dbh->selectrow_array(
		"SELECT COUNT(*), COUNT(DISTINCT t.id), COUNT(DISTINCT t.primary_artist),
		        COUNT(DISTINCT (h.played + ?) / 86400), MIN(h.played) $joined",
		undef, $tz, $since
	);
	$r{$_} ||= 0 for keys %r;

	($r{library}) = $dbh->selectrow_array('SELECT COUNT(*) FROM tracks WHERE audio = 1');

	# How many tracks hold each star rating, regardless of the range.
	$r{stars} = {};
	my $rows = $dbh->selectall_arrayref(
		'SELECT (s.rating + 10) / 20, COUNT(DISTINCT t.id)
		   FROM persistentdb.track_statistics s JOIN tracks t ON t.url = s.url
		  WHERE s.rating >= ? GROUP BY 1',
		undef, RATED
	);
	$r{stars}{$_->[0]} = $_->[1] for grep { $_->[0] >= 1 && $_->[0] <= 5 } @$rows;
	$r{rated} = 0;
	$r{rated} += $_ for values %{ $r{stars} };

	# Plays per local day for the calendar.
	$r{days} = $dbh->selectall_arrayref(
		"SELECT (h.played + ?) / 86400, COUNT(*) $joined GROUP BY 1 ORDER BY 1",
		undef, $tz, $now - CALENDAR_DAYS * DAY
	);

	return \%r;
}

=head2 artists($dbh, days => N, start => I, items => N, now => EPOCH)

Artists by plays in the range, a page at a time. Returns the total number of
artists and the page. `mixable` is true when MusicIP has analysed any track
of theirs that was played, which is when it can seed a mix from the artist.

=cut

sub artists {
	my ($dbh, %o) = @_;
	my $since = _since($o{days} || 0, $o{now} || time());
	my ($start, $items) = (int($o{start} || 0), int($o{items} || 10));

	my $from = 'FROM persistentdb.track_history h
	            JOIN tracks t ON t.url = h.url
	            JOIN contributors c ON c.id = t.primary_artist
	           WHERE h.played > 0 AND h.played >= ?';

	my ($count) = $dbh->selectrow_array("SELECT COUNT(DISTINCT c.id) $from", undef, $since);

	my $rows = $dbh->selectall_arrayref(
		"SELECT c.id, c.name, COUNT(*) AS plays, MAX(COALESCE(t.musicmagic_mixable, 0))
		   $from GROUP BY c.id ORDER BY plays DESC, c.id LIMIT $items OFFSET $start",
		undef, $since
	);

	return {
		count => $count || 0,
		artists => [ map { { id => $_->[0], artist => _text($_->[1]), plays => $_->[2], mixable => $_->[3] ? 1 : 0 } } @$rows ],
	};
}

=head2 lapsed($dbh, days => N, start => I, items => N, now => EPOCH)

Loved tracks (4 stars or better) not played for `days` (default a year),
most played first. A loved track that was never played has `last` of 0.

=cut

sub lapsed {
	my ($dbh, %o) = @_;
	my ($days, $now) = ($o{days} || 365, $o{now} || time());
	my $before = $now - $days * DAY;
	my ($start, $items) = (int($o{start} || 0), int($o{items} || 10));

	my $from = 'FROM persistentdb.track_statistics s
	            JOIN tracks t ON t.url = s.url
	           WHERE s.rating >= ? AND t.audio = 1
	           GROUP BY t.id
	          HAVING COALESCE(MAX(s.lastPlayed), 0) < CAST(? AS INTEGER)';

	my ($count) = $dbh->selectrow_array("SELECT COUNT(*) FROM (SELECT t.id $from)", undef, LOVED, $before);

	my $rows = $dbh->selectall_arrayref(
		"SELECT t.id, t.title, t.primary_artist, c.name, t.album, a.title, t.coverid,
		        COALESCE(t.musicmagic_mixable, 0), COALESCE(MAX(s.playCount), 0), COALESCE(MAX(s.lastPlayed), 0)
		   FROM persistentdb.track_statistics s
		   JOIN tracks t ON t.url = s.url
		   LEFT JOIN contributors c ON c.id = t.primary_artist
		   LEFT JOIN albums a ON a.id = t.album
		  WHERE s.rating >= ? AND t.audio = 1
		  GROUP BY t.id
		 HAVING COALESCE(MAX(s.lastPlayed), 0) < CAST(? AS INTEGER)
		  ORDER BY 9 DESC, 10 ASC, t.id
		  LIMIT $items OFFSET $start",
		undef, LOVED, $before
	);

	return {
		count => $count || 0,
		tracks => [
			map {
				{
					id        => $_->[0],
					title     => _text($_->[1]),
					artist_id => $_->[2] // '',
					artist    => _text($_->[3]),
					album_id  => $_->[4] // '',
					album     => _text($_->[5]),
					coverid   => $_->[6] // '',
					mixable   => $_->[7] ? 1 : 0,
					plays     => $_->[8],
					last      => $_->[9],
				}
			} @$rows
		],
	};
}

=head2 unplayed($dbh, items => N)

A random sample of artists on albums in the library that have never been
played, and how many such artists there are. "Never played" means none of
their tracks is in the history and none has a play count, so a track played
before TrackStat kept a history still counts as heard. Compilation credits
("Various ...") aren't artists to start from, so they're left out.

`mixable` is true when MusicIP has analysed any track of theirs, and
`coverid` is the cover of one of their tracks, if any has one.

=cut

sub unplayed {
	my ($dbh, %o) = @_;
	my $items = int($o{items} || 12);

	my $from = q{
		FROM contributors c
		WHERE c.id IN (SELECT contributor FROM contributor_album WHERE role IN (1, 5))
		  AND c.name NOT LIKE 'Various%'
		  AND c.musicbrainz_id IS NOT '89ad4ac3-39f7-470e-963a-56509c546377'
		  AND c.id NOT IN (
		        SELECT ct.contributor
		          FROM contributor_track ct
		          JOIN tracks t ON t.id = ct.track
		          JOIN persistentdb.track_history h ON h.url = t.url
		         WHERE h.played > 0
		        UNION
		        SELECT ct.contributor
		          FROM contributor_track ct
		          JOIN tracks t ON t.id = ct.track
		          JOIN persistentdb.track_statistics s ON s.url = t.url
		         WHERE s.playCount > 0)
	};

	my ($count) = $dbh->selectrow_array("SELECT COUNT(*) $from");

	my $rows = $dbh->selectall_arrayref(
		"SELECT c.id, c.name,
		        (SELECT COUNT(DISTINCT ca.album) FROM contributor_album ca
		          WHERE ca.contributor = c.id AND ca.role IN (1, 5)),
		        (SELECT COALESCE(MAX(t.musicmagic_mixable), 0) FROM contributor_track ct
		          JOIN tracks t ON t.id = ct.track WHERE ct.contributor = c.id),
		        (SELECT t.coverid FROM contributor_track ct
		          JOIN tracks t ON t.id = ct.track
		         WHERE ct.contributor = c.id AND t.coverid IS NOT NULL LIMIT 1)
		   $from ORDER BY RANDOM() LIMIT $items"
	);

	return {
		count => $count || 0,
		artists => [
			map { { id => $_->[0], artist => _text($_->[1]), albums => $_->[2], mixable => $_->[3] ? 1 : 0, coverid => $_->[4] // '' } } @$rows
		],
	};
}

1;
