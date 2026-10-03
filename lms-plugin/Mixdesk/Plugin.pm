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

use strict;
use base qw(Slim::Plugin::Base);

use File::Basename qw(dirname);
use File::Spec::Functions qw(catfile);
use HTTP::Status qw(RC_OK RC_NOT_FOUND);

use Slim::Utils::Log;

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

	return unless main::WEBUI;

	Slim::Web::Pages->addRawFunction('^/?mixdesk(?:/|$)', \&_serve);
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
