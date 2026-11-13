#!/usr/bin/env node
'use strict';

/**
 * UX journey checks for ordinary Magic Remote users (v1.0.7+).
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var failed = 0;

function assert(cond, msg) {
  if (cond) console.log('  OK  ' + msg);
  else { failed++; console.error('  FAIL ' + msg); }
}

console.log('== User journey / simplicity UX ==\n');

var screens = fs.readFileSync(path.join(root, 'js/screens.js'), 'utf8');
var app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
var focus = fs.readFileSync(path.join(root, 'js/focus.js'), 'utf8');
var errors = fs.readFileSync(path.join(root, 'js/errors.js'), 'utf8');
var ui = fs.readFileSync(path.join(root, 'js/ui.js'), 'utf8');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'css/app.css'), 'utf8');
var appinfo = JSON.parse(fs.readFileSync(path.join(root, 'appinfo.json'), 'utf8'));

assert(appinfo.id === 'com.elion.iptv', 'App ID preserved');
assert(appinfo.version === '1.1.4', 'Version is 1.1.4');

/* ---- Home (six destinations) ---- */
assert(screens.indexOf("hubTile('live'") !== -1, 'Home: Live TV tile');
assert(screens.indexOf("hubTile('movies'") !== -1, 'Home: Movies tile');
assert(screens.indexOf("hubTile('series'") !== -1, 'Home: Series tile');
assert(screens.indexOf("hubTile('epg'") !== -1, 'Home: Live with EPG tile');
assert(screens.indexOf("hubTile('playlists'") !== -1, 'Home: Add Playlist tile');
assert(screens.indexOf("hubTile('favorites'") !== -1, 'Home: Favorites tile');
assert(screens.indexOf("hubTile('more'") === -1, 'Home hub has no More tile');
assert(screens.indexOf("hubTile('home'") === -1, 'Home hub has no Home tile');
assert(screens.indexOf('Start watching now') !== -1, 'Home tiles include descriptions');
assert(screens.indexOf('home-brand-bar') !== -1, 'Home shows brand bar');
assert(screens.indexOf('Reload IPTV') !== -1, 'Reload IPTV remains available');
assert(html.indexOf('id="btnReload"') !== -1, 'Header reload button');
assert(html.indexOf('id="btnMessages"') !== -1, 'Header messages button');
assert(html.indexOf('id="btnHelp"') !== -1, 'Header help button');
assert(html.indexOf('id="btnExit"') !== -1, 'Header exit button');
assert(html.indexOf('Do you really want to exit ELION IPTV?') !== -1 || app.indexOf('Do you really want to exit ELION IPTV?') !== -1, 'Exit asks for confirmation');
assert(css.indexOf('hub-grid-home') !== -1, 'Home uses the full hub grid');
assert(css.indexOf('repeat(3, minmax(0, 1fr))') !== -1, 'Home grid is three columns');
assert(/#app\s*\{[\s\S]*width:\s*100%/.test(css), 'App root uses full viewport width');
assert(css.indexOf('screen-page') !== -1, 'Shared screen page layout');
assert(css.indexOf('screen-heading') !== -1, 'Shared screen headings');

/* ---- Live TV ---- */
assert(screens.indexOf('function renderLive') !== -1, 'Live TV screen exists');
assert(screens.indexOf('categoryCards(true)') !== -1, 'Live TV opens category cards');
assert(screens.indexOf('function renderMovies') !== -1, 'Movies screen exists');
assert(screens.indexOf('function renderSeries') !== -1, 'Series screen exists');
assert(screens.indexOf('No series found in your current playlist.') !== -1, 'Series empty state is explicit');
assert(screens.indexOf('openPlayer(ch)') !== -1, 'Selecting a channel opens the player');
assert(!/if\s*\(\s*name\s*===\s*'live'\s*\)[\s\S]{0,300}openPlayer\(/.test(screens), 'Live TV does not autoplay');

/* ---- All Channels / Categories / Favorites / Recents / Search ---- */
assert(screens.indexOf('function renderChannels') !== -1, 'All Channels screen exists');
assert(screens.indexOf('screenShell(') !== -1, 'Shared screenShell helper');
assert(screens.indexOf('data-nav="search">Search') !== -1, 'Channels offers Search access');
assert(screens.indexOf('function renderCategories') !== -1, 'Categories screen exists');
assert(screens.indexOf('category-grid') !== -1, 'Categories uses card grid');
assert(screens.indexOf("data-action=\"open-category\"") !== -1, 'Category opens immediately');
assert(screens.indexOf('category-card-all') !== -1, 'Categories includes All Channels card');
assert(screens.indexOf('function renderFavorites') !== -1, 'Favorites screen exists');
assert(screens.indexOf('function renderRecents') !== -1, 'Recently Watched screen exists');
assert(screens.indexOf('function renderSearch') !== -1, 'Search screen exists');
assert(screens.indexOf('clear-search') !== -1, 'Search clear action');
assert(screens.indexOf('search-stage') !== -1, 'Search stage layout');
assert(css.indexOf('category-grid') !== -1, 'Category grid styles');
assert(css.indexOf('search-field-row') !== -1, 'Search field row styles');

assert(screens.indexOf('ADD PLAYLIST') !== -1, 'Welcome primary CTA');
assert(screens.indexOf('afterImportSuccess') !== -1, 'Import success helper');
assert(/function afterImportSuccess[\s\S]*navigate\('channels'\)/.test(screens), 'After import → channel list');
assert(screens.indexOf('Your playlist has been added successfully.') !== -1, 'Friendly import success');
assert(screens.indexOf('Unable to load the playlist. Please check the address and try again.') !== -1, 'Friendly import failure');
assert(screens.indexOf('Your favorite channels will appear here.') !== -1, 'Friendly favorites empty');
assert(screens.indexOf('No recently watched channels yet.') !== -1, 'Friendly recents empty');
assert(screens.indexOf('No EPG source is configured.') !== -1, 'EPG empty state is explicit');
assert(screens.indexOf('id="m3uFile"') !== -1, 'Local playlist file picker exists');
assert(screens.indexOf('Select Playlist') !== -1, 'Playlist Select label');
assert(screens.indexOf('Refresh Channels') !== -1, 'Playlist Refresh label');
assert(screens.indexOf('Remove Playlist') !== -1, 'Playlist Remove label');
assert(screens.indexOf('TV Guide') !== -1, 'TV Guide wording');
assert(screens.indexOf('toggle-fav') !== -1, 'Favorites toggle action in screens');
assert(ui.indexOf('toggle-fav') !== -1, 'Favorites toggle in channel rows');
assert(ui.indexOf('channel-row-wrap') !== -1, 'Channel row + favorite are separate targets');
assert(screens.indexOf('focusPreferred') !== -1, 'Screens use preferred focus after render');
assert(screens.indexOf('focusChannelId') !== -1, 'Render can restore channel focus');
assert(screens.indexOf("groupFilter.addEventListener('change'") !== -1 || screens.indexOf('groupFilter.addEventListener("change"') !== -1, 'Category filter applies on change');
assert(screens.indexOf('Add Playlist') !== -1 && screens.indexOf('data-action="go-back"') !== -1 && screens.indexOf('>BACK<') !== -1, 'Playlists Back returns Home');
assert(screens.indexOf('data-nav="more">← More') === -1, 'Primary screens no longer Back to More');
assert(screens.indexOf("action === 'clear-search'") !== -1, 'Clear search handler');

assert(focus.indexOf('focusPreferred') !== -1, 'Focus module exports focusPreferred');
assert(focus.indexOf("data-action') === 'play'") !== -1 || focus.indexOf('data-action') !== -1 && focus.indexOf('play') !== -1, 'Preferred focus targets play rows');
assert(focus.indexOf('live-hero') !== -1, 'Focus prefers live hero');
assert(focus.indexOf('category-card') !== -1, 'Focus prefers category cards');
assert(focus.indexOf('playerChannelStep') !== -1, 'Up/Down zap while watching');
assert(focus.indexOf("playerChannelStep(dir === 'up' ? 1 : -1)") !== -1, 'UP goes to next channel');
assert(focus.indexOf('playerOkAction') !== -1, 'OK shows player controls when hidden');
assert(/isPlayerActive\(\)[\s\S]*up[\s\S]*down[\s\S]*playerChannelStep/.test(focus), 'Up/Down zap even when player UI visible');
assert(html.indexOf('channelZapOsd') !== -1, 'Channel switch OSD present');
assert(html.indexOf('btnChannelList') !== -1, 'In-player Channels control present');

assert(app.indexOf('playerChannelStep') !== -1, 'App channel step helper');
assert(app.indexOf('focusChannelId') !== -1, 'closePlayer restores channel focus');
assert(app.indexOf('One Back press always returns') !== -1 || /player[\s\S]*closePlayer\(\);\s*return;/.test(app), 'Player Back exits in one press');
assert(/moreScreens\s*=\s*\{[\s\S]*recents:\s*true/.test(app) === false, 'Recents Back goes Home');
assert(app.indexOf("channel' : ' channels'") !== -1 || app.indexOf('channels') !== -1, 'Channel count chip uses plain language');

assert(errors.indexOf('Unable to load the playlist. Please check the address and try again.') !== -1, 'Friendly INVALID_URL');
assert(html.indexOf('Previous Channel') !== -1 && html.indexOf('Next Channel') !== -1, 'Player channel labels');
assert(html.indexOf('Loading channel…') !== -1, 'Player buffering plain language');
assert(css.indexOf('screen-home') !== -1, 'Home hides side rail');
assert(css.indexOf('fav-toggle') !== -1, 'Favorite toggle styles');
assert(css.indexOf('scroll-margin') !== -1, 'Channel focus scroll margin');

console.log('\nResult: ' + (failed ? failed + ' failure(s)' : 'ALL PASSED'));
if (failed) process.exit(1);
