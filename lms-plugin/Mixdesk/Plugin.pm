package Plugins::Mixdesk::Plugin;

# Serves the built Mixdesk web app at http://<server>:9000/mixdesk/.
#
# The app lives in HTML/EN/mixdesk. A raw handler serves it, writing each
# response itself: LMS's static-file code would send .js and .css as
# application/octet-stream (which browsers refuse to run), and its download
# handler marks pages as attachments. Raw handlers run before either.
#
# Everything else the app needs (jsonrpc.js, cover art, the settings pages) is
# LMS itself, so it's all same-origin.
#
# The one thing LMS can't answer is what TrackStat has recorded over time, so
# three read-only CLI queries (mixdesk stats / statartists / statlapsed) read
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

use Plugins::Mixdesk::Stats;

my $log = Slim::Utils::Log->addLogCategory({
	category     => 'plugin.mixdesk',
	defaultLevel => 'WARN',
	description  => 'PLUGIN_MIXDESK',
});

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

	return unless main::WEBUI;

	Slim::Web::Pages->addRawFunction('^/?mixdesk(?:/|$)', \&_serve);
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

	$request->addResult($_, $s->{$_} || 0) for qw(plays tracks artists active_days first library rated no_year);

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
	$i = 0;
	for my $e (@{ $s->{eras} }) {
		$request->addResultLoop('eras_loop', $i, 'decade', $e->[0]);
		$request->addResultLoop('eras_loop', $i, 'plays', $e->[1]);
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
	return unless $httpClient->connected;

	my $rel  = _relative($response->request->uri->path);
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
