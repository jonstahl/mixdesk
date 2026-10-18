package Plugins::Mixdesk::Settings;

# The plugin's page under Settings -> Manage Plugins -> Mixdesk (and in the
# settings dropdown). It has one option, whether Mixdesk answers at the
# server's root address; Plugin.pm acts on it as soon as it's saved.

use strict;
use base qw(Slim::Web::Settings);

use Slim::Utils::Prefs;

my $prefs = preferences('plugin.mixdesk');

sub name {
	return Slim::Web::HTTP::CSRF->protectName('PLUGIN_MIXDESK');
}

sub page {
	return Slim::Web::HTTP::CSRF->protectURI('plugins/Mixdesk/settings/basic.html');
}

sub prefs {
	return ($prefs, 'homepage');
}

1;
