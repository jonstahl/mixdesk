package Plugins::Mixdesk::Plugin;

# Serves the built Mixdesk web app at http://<server>:9000/mixdesk/.
#
# The app lives in HTML/EN/mixdesk. A raw handler serves it, writing each
# response itself: LMS's static-file code would send .js and .css as
# application/octet-stream (which browsers refuse to run), and its download
# handler marks pages as attachments. Raw handlers run before either.
#
# With the "homepage" setting on, the server's own address (/ and /index.html)
# serves the app too, in place of the default skin's home page. The app finds
# its files at absolute /mixdesk/ paths and routes on the URL hash, so it runs
# the same from either address. The other skins stay at /<skin>/, e.g. /material/.
#
# A raw handler can't pass a request on, so the handler is only registered
# while the setting is on and is removed when it's switched off, which takes
# effect at once with no restart.
#
# Everything else the app needs (jsonrpc.js, cover art, the settings pages) is
# LMS itself, so it's all same-origin.
#
# The one thing LMS can't answer is what TrackStat has recorded over time, so
# four read-only CLI queries (mixdesk stats / statartists / statlapsed /
# statunplayed) read
# its tables through Plugins::Mixdesk::Stats and hand the Stats page small
# summaries instead of the whole history.

use strict;
use base qw(Slim::Plugin::Base);

use File::Basename qw(dirname);
use File::Spec::Functions qw(catfile);
use HTTP::Status qw(RC_OK RC_NOT_FOUND);

use Slim::Control::Request;
use Slim::Schema;
use Slim::Utils::Log;
use Slim::Utils::Prefs;

use Plugins::Mixdesk::Stats;

my $log = Slim::Utils::Log->addLogCategory({
	category     => 'plugin.mixdesk',
	defaultLevel => 'WARN',
	description  => 'PLUGIN_MIXDESK',
});

my $prefs = preferences('plugin.mixdesk');

my $htdocs = catfile(dirname(__FILE__), 'HTML', 'EN', 'mixdesk');

my %types = (
	html  => 'text/html; charset=utf-8',
	js    => 'application/javascript; charset=utf-8',
	css   => 'text/css; charset=utf-8',
	svg   => 'image/svg+xml',
	png   => 'image/png',
	ico   => 'image/x-icon',
	json  => 'application/json',
	woff2 => 'font/woff2',
	webmanifest => 'application/manifest+json',
);

sub initPlugin {
	my $class = shift;
	$class->SUPER::initPlugin(@_);

	# Queries for the Stats page. Anyone on the JSON-RPC interface can call
	# them, which is also how the app does.
	Slim::Control::Request::addDispatch(['mixdesk', 'stats'], [0, 1, 1, \&_statsQuery]);
	Slim::Control::Request::addDispatch(['mixdesk', 'statartists', '_index', '_quantity'], [0, 1, 1, \&_artistsQuery]);
	Slim::Control::Request::addDispatch(['mixdesk', 'statlapsed', '_index', '_quantity'], [0, 1, 1, \&_lapsedQuery]);
	Slim::Control::Request::addDispatch(['mixdesk', 'statunplayed', '_quantity'], [0, 1, 1, \&_unplayedQuery]);
	Slim::Control::Request::addDispatch(['mixdesk', 'statplays'], [0, 1, 1, \&_playsQuery]);

	return unless main::WEBUI;

	Slim::Web::Pages->addRawFunction('^/?mixdesk(?:/|$)', \&_serve);

	require Plugins::Mixdesk::Settings;
	Plugins::Mixdesk::Settings->new;

	$prefs->init({ homepage => 0 });
	$prefs->setChange(\&_homepage, 'homepage');
	_homepage();
}

# --- Home page -------------------------------------------------------------------

# A qr// rather than a string: Tie::RegexpHash matches a string key against the
# existing keys, but compares a qr// key by identity, which is also how it's removed.
my $homeRe = qr{^/?(?:index\.html)?$};
my $homeOn = 0;

sub _homepage {
	my $want = $prefs->get('homepage') ? 1 : 0;
	return if $want == $homeOn;

	if ($want) {
		Slim::Web::Pages->addRawFunction($homeRe, \&_home);
	}
	else {
		delete $Slim::Web::Pages::rawFunctions{$homeRe};
	}
	$homeOn = $want;
}

sub _home {
	my ($httpClient, $response) = @_;
	_send($httpClient, $response, 'index.html');
}

# --- Stats queries -------------------------------------------------------------

sub _int {
	my ($v, $default) = @_;
	return defined $v && $v =~ /^-?\d+$/ ? int($v) : $default;
}

# Runs a query against TrackStat's tables and returns its result, with
# available:1 already on the request; the caller adds the rest and finishes.
# When the tables aren't there (TrackStat not installed, or never run) the
# answer is available:0 rather than an error.
sub _stats_query {
	my ($request, $command, $code) = @_;

	if ($request->isNotQuery([['mixdesk'], [$command]])) {
		$request->setStatusBadDispatch();
		return;
	}

	my $result = eval {
		my $dbh = Slim::Schema->dbh;
		Plugins::Mixdesk::Stats::history($dbh) ? $code->($dbh) : undef;
	};
	$log->warn("$command: $@") if $@;

	$request->addResult('available', $result ? 1 : 0);
	$request->setStatusDone() unless $result;
	return $result;
}

sub _statsQuery {
	my $request = shift;
	my $s = _stats_query($request, 'stats', sub {
		Plugins::Mixdesk::Stats::summary(
			shift,
			days => _int($request->getParam('days'), 0),
			tz   => _int($request->getParam('tz'), 0),
			now  => time(),
		);
	}) or return;

	$request->addResult($_, $s->{$_} || 0) for qw(plays tracks artists active_days first library rated);

	my $i = 0;
	for my $star (sort { $a <=> $b } keys %{ $s->{stars} }) {
		$request->addResultLoop('stars_loop', $i, 'stars', $star);
		$request->addResultLoop('stars_loop', $i, 'tracks', $s->{stars}{$star});
		$i++;
	}
	$i = 0;
	for my $d (@{ $s->{days} }) {
		$request->addResultLoop('days_loop', $i, 'day', $d->[0]);
		$request->addResultLoop('days_loop', $i, 'plays', $d->[1]);
		$i++;
	}
	$request->setStatusDone();
}

sub _artistsQuery {
	my $request = shift;
	my $start = _int($request->getParam('_index'), 0);
	my $items = _int($request->getParam('_quantity'), 10);
	my $r = _stats_query($request, 'statartists', sub {
		Plugins::Mixdesk::Stats::artists(
			shift,
			days  => _int($request->getParam('days'), 0),
			start => $start,
			items => $items,
			now   => time(),
		);
	}) or return;

	$request->addResult('count', $r->{count});
	my $i = 0;
	for my $a (@{ $r->{artists} }) {
		$request->addResultLoop('artists_loop', $i, $_, $a->{$_}) for keys %$a;
		$i++;
	}
	$request->setStatusDone();
}

sub _unplayedQuery {
	my $request = shift;
	my $items = _int($request->getParam('_quantity'), 12);
	my $r = _stats_query($request, 'statunplayed', sub {
		Plugins::Mixdesk::Stats::unplayed(shift, items => $items);
	}) or return;

	$request->addResult('count', $r->{count});
	my $i = 0;
	for my $a (@{ $r->{artists} }) {
		$request->addResultLoop('artists_loop', $i, $_, $a->{$_}) for keys %$a;
		$i++;
	}
	$request->setStatusDone();
}

# Play counts for a handful of tracks (track_id:1,2,3), 500 at most. Only
# tracks that have been played come back.
sub _playsQuery {
	my $request = shift;
	my @ids = split /,/, ($request->getParam('track_id') // '');
	splice @ids, 500 if @ids > 500;
	my $r = _stats_query($request, 'statplays', sub {
		{ plays => Plugins::Mixdesk::Stats::plays(shift, ids => \@ids) };
	}) or return;

	my $i = 0;
	for my $id (sort { $a <=> $b } keys %{ $r->{plays} }) {
		$request->addResultLoop('plays_loop', $i, 'id', $id);
		$request->addResultLoop('plays_loop', $i, 'plays', $r->{plays}{$id});
		$i++;
	}
	$request->setStatusDone();
}

sub _lapsedQuery {
	my $request = shift;
	my $start = _int($request->getParam('_index'), 0);
	my $items = _int($request->getParam('_quantity'), 10);
	my $r = _stats_query($request, 'statlapsed', sub {
		Plugins::Mixdesk::Stats::lapsed(
			shift,
			days  => _int($request->getParam('days'), 365),
			start => $start,
			items => $items,
			now   => time(),
		);
	}) or return;

	$request->addResult('count', $r->{count});
	my $i = 0;
	for my $t (@{ $r->{tracks} }) {
		$request->addResultLoop('titles_loop', $i, $_, $t->{$_}) for keys %$t;
		$i++;
	}
	$request->setStatusDone();
}

sub _serve {
	my ($httpClient, $response) = @_;
	_send($httpClient, $response, _relative($response->request->uri->path));
}

sub _send {
	my ($httpClient, $response, $rel) = @_;
	return unless $httpClient->connected;

	my $file = _file($rel);
	my $body = $file && _read($file);

	if (defined $body) {
		my ($ext) = $file =~ /\.(\w+)$/;
		$response->code(RC_OK);
		$response->content_type($types{lc($ext // '')} || 'application/octet-stream');
		# Built assets have content hashes in their names; the page doesn't.
		$response->header('Cache-Control' => $rel =~ m{^assets/} ? 'max-age=31536000, immutable' : 'no-cache');
	}
	else {
		$response->code(RC_NOT_FOUND);
		$response->content_type('text/plain');
		$body = 'Not found';
	}

	# LMS queues the body and writes it out as the socket allows; a raw
	# handler must not close the socket itself or large files get cut off.
	$response->content_length(length $body);
	Slim::Web::HTTP::addHTTPResponse($httpClient, $response, \$body, 1, 0);
}

sub _relative {
	my $path = shift;
	$path =~ s{^/*mixdesk/?}{};
	$path = 'index.html' if $path eq '';
	return $path;
}

sub _file {
	my $rel = shift;

	# Only plain relative paths inside htdocs; anything else is a 404.
	if ($rel =~ m{(?:^|/)\.\.(?:/|$)} || $rel =~ m{^/}) {
		$log->warn("refusing path $rel");
		return;
	}

	my $file = catfile($htdocs, split m{/}, $rel);

	return $file if -f $file;

	# The app routes with #hashes, so an unknown page falls back to the app
	# shell; a missing file with an extension (a stale asset) is a 404.
	return $rel =~ /\.\w+$/ ? undef : catfile($htdocs, 'index.html');
}

sub _read {
	my $file = shift;
	open(my $fh, '<:raw', $file) or do {
		$log->warn("can't read $file: $!");
		return;
	};
	local $/;
	my $body = <$fh>;
	close $fh;
	return $body;
}

1;
