/**
 * English: the source and the fallback (F12 R2, R13).
 *
 * Every key lives here first. `messages.test.ts` fails if another language
 * has drifted from this key set — a string added here and forgotten in
 * Vietnamese would otherwise be a silent English sentence in the middle of a
 * Vietnamese page, which looks like a translation nobody got round to rather
 * than a bug.
 *
 * Placeholders are %named%, so a translator can move them to wherever the
 * sentence needs them.
 *
 * Nothing the admin types is in here (F12 R10): prize names, the campaign
 * name, the company name and the tagline are shown exactly as entered.
 */
export const en = {
  // -- Shared ---------------------------------------------------------
  'language.label': 'Language',
  'common.tryAgain': 'Try again',
  'common.save': 'Save',
  'common.saving': 'Saving…',
  'common.saved': 'Saved',
  'common.unsavedChanges': 'Unsaved changes',
  'common.loading': 'Loading…',

  // -- Player page ----------------------------------------------------
  'player.heading': 'Spin to win',
  'player.tagline': 'One spin, one prize. Good luck.',
  'player.logoAlt': 'Logo',
  'player.spin': 'Spin',
  'player.spinning': 'Spinning…',
  'player.nextPlayer': 'Next player',
  'player.playingAs': 'Playing as %name%',
  'player.notYou': 'Not you?',
  'player.youWon': 'You won',
  'player.claim': 'Show this screen to a member of staff to claim it.',
  'player.loadFailed': 'The game could not be loaded.',
  'player.spinFailed': 'The spin could not be completed. Please try again.',
  'player.identityLost': 'The game needs to know who is playing. Please enter your number again.',

  // -- Identity step --------------------------------------------------
  'identity.kicker': 'Before you spin',
  'identity.phoneHeading': 'Enter your phone number',
  'identity.phoneLead':
    'It is how we know who is playing, and how we find you if you have played before.',
  'identity.phoneLabel': 'Phone number',
  'identity.phonePlaceholder': '0912 345 678',
  'identity.continue': 'Continue',
  'identity.checking': 'Checking…',
  'identity.detailsHeading': 'Nice to meet you',
  'identity.detailsLead': 'First time for %phone%. Three quick things.',
  'identity.firstName': 'First name',
  'identity.lastName': 'Last name',
  'identity.birthday': 'Birthday',
  'identity.start': 'Start playing',
  'identity.changeNumber': 'Change number',
  'identity.lookupFailed': 'We could not check that number. Please try again.',
  'identity.phoneUnusable': 'That phone number could not be used.',
  'identity.saveFailed': 'We could not save those details. Please try again.',
  'identity.detailsUnusable': 'Those details could not be used.',

  // Mirrors of the server's rules, so a mistake is caught before a round
  // trip (F08 R4, R10).
  'identity.phoneRequired': 'Enter your phone number.',
  'identity.phoneInvalid':
    'That does not look like a phone number. It needs between %min% and %max% digits.',
  'identity.firstNameRequired': 'Enter your first name.',
  'identity.lastNameRequired': 'Enter your last name.',
  'identity.firstNameTooLong': 'A first name can be at most %max% characters.',
  'identity.lastNameTooLong': 'A last name can be at most %max% characters.',
  'identity.birthdayRequired': 'Enter your birthday.',
  'identity.birthdayInvalid': 'Enter your birthday as a date, for example 1994-03-12.',
  'identity.birthdayFuture': 'A birthday cannot be in the future.',
  'identity.birthdayTooEarly': 'Please check that birthday.',

  // -- Admin frame ----------------------------------------------------
  'admin.title': 'Roulette admin',
  'admin.signOut': 'Sign out',
  'admin.modules': 'Admin modules',
  'admin.sessionEnded': 'Your session has ended',
  'admin.sessionEndedLead': 'Sign in again to carry on. Your changes are still here.',
  'admin.signInAndContinue': 'Sign in and continue',
  'admin.checkingSession': 'Checking your session…',

  // -- Login ----------------------------------------------------------
  'login.heading': 'Sign in',
  'login.username': 'Username',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.signingIn': 'Signing in…',
  'login.bothRequired': 'Enter your username and password.',
  'login.badCredentials': 'That username or password is not right.',
  'login.throttled': 'Too many attempts. Please wait a few minutes and try again.',
  'login.failed': 'Could not sign in. Please try again.',
  'login.accountsNote': 'Accounts are created on the server with %command%.',

  // -- Game module ----------------------------------------------------
  'game.title': 'Game',
  'game.lead': 'The prizes on the wheel and how the campaign looks.',
  'game.prizes': 'Wheel prizes',
  'game.prizesLead': 'Every slice is drawn the same size. The percentage sets how often it is won.',
  'game.preview': 'Wheel preview',
  'game.prizeList': 'Prize list',
  'game.addPrize': 'Add prize',
  'game.atMostPrizes': 'A wheel can have at most %max% prizes.',
  'game.total': 'Total: %total%% of %required%%',
  'game.totalUnknown': 'Total: —',
  'game.loadFailed': 'The wheel could not be loaded.',
  'game.saveFailed': 'The configuration could not be saved. Your changes are still here.',
  'game.rejected': 'The server rejected this configuration.',
  'game.emptyWheel': 'An empty wheel',
  'game.prizeName': 'Prize name',
  'game.prizePercentage': 'Percentage',
  'game.moveUp': 'Move up',
  'game.moveDown': 'Move down',
  'game.remove': 'Remove',

  // -- Branding -------------------------------------------------------
  'branding.title': 'Branding',
  'branding.companyName': 'Company name',
  'branding.campaignName': 'Campaign name',
  'branding.campaignHint': 'Shown as the heading on the player page.',
  'branding.tagline': 'Tagline',
  'branding.taglineHint': 'Leave blank to use “%default%”.',
  'branding.theme': 'Theme',
  // F15 R10, R11. The hint says what changing it affects, because the
  // obvious guess — that the amounts convert — is the wrong one.
  'branding.currencyHint': 'What every amount-off reward is counted in. Changing it relabels the amounts; it does not convert them.',
  'branding.logo': 'Logo',
  'branding.currentLogo': 'Current logo',
  'branding.removeLogo': 'Remove logo',
  'branding.logoHint': 'PNG, JPEG, WebP or SVG, up to %max%MB. SVG files are cleaned before use.',
  'branding.loadFailed': 'The branding could not be loaded.',
  'branding.saveFailed': 'The branding could not be saved. Your changes are still here.',

  // -- Players module -------------------------------------------------
  'players.title': 'Players',
  'players.lead': 'Everyone who has given a phone number to play. Open one to see what they have won.',
  'players.list': 'Player list',
  'players.count': '%count% players',
  'players.countOne': '1 player',
  'players.filterLabel': 'Filter by phone number',
  'players.filterPlaceholder': 'Any part of the number, e.g. 5678',
  'players.loading': 'Loading the players…',
  'players.loadFailed': 'The players could not be loaded.',
  'players.none': 'Nobody has played yet.',
  'players.noMatch': 'No players match that number.',
  'players.capped': 'Showing the first %shown% of %total% players.',
  'players.colName': 'Name',
  'players.colPhone': 'Phone',
  'players.colBirthday': 'Birthday',
  'players.colJoined': 'Joined',
  'players.colSpins': 'Spins',
  'players.history': 'Spin history',
  'players.historyLoading': 'Loading the history…',
  'players.historyFailed': 'That history could not be loaded.',
  'players.historyNone': 'This player has not spun yet.',

  // -- Spins module ---------------------------------------------------
  'spins.title': 'Spins',
  'spins.lead': 'Every play, newest first. What was won, by whom, and when.',
  'spins.log': 'Spin log',
  'spins.count': '%count% spins',
  'spins.countOne': '1 spin',
  'spins.loading': 'Loading the spins…',
  'spins.loadFailed': 'The spins could not be loaded.',
  'spins.none': 'No spins yet.',
  'spins.noMatch': 'No spins from that number.',
  'spins.capped': 'Showing the most recent %shown% of %total% spins.',
  'spins.colPrize': 'Prize',
  'spins.colPlayer': 'Player',
  'spins.colPhone': 'Phone',
  'spins.colSpun': 'Spun',
  'spins.colCode': 'Code',
  'spins.colStatus': 'Status',
  'spins.claimed': 'Claimed',
  'spins.notClaimed': 'Not claimed',
  'spins.claim': 'Claim',
  'spins.unclaim': 'Undo',
  'spins.claimFailed': 'That could not be changed. Please try again.',

  // -- Reward types (F13 R2) ------------------------------------------
  'rewardType.free_product': 'Free product',
  'rewardType.percent_off': 'Percentage off',
  'rewardType.amount_off': 'Amount off',
  'rewardType.nothing': 'Nothing',

  // -- Rewards module (F13) -------------------------------------------
  'rewards.title': 'Rewards',
  'rewards.lead': 'What the wheel can give away. Every slice points at one of these.',
  'rewards.list': 'Reward catalogue',
  'rewards.count': '%count% rewards',
  'rewards.countOne': '1 reward',
  'rewards.add': 'Add a reward',
  'rewards.edit': 'Edit',
  'rewards.delete': 'Delete',
  'rewards.cancel': 'Cancel',
  'rewards.name': 'Name',
  'rewards.type': 'Type',
  'rewards.value': 'Value',
  'rewards.currency': 'Currency',
  'rewards.currencyHint': 'The campaign is counted in one currency. Changing it here changes it everywhere.',
  'rewards.colName': 'Name',
  'rewards.colType': 'Type',
  'rewards.colValue': 'Value',
  'rewards.colUsedBy': 'On the wheel',
  'rewards.colAdded': 'Added',
  'rewards.none': 'No rewards yet. Add one to put it on the wheel.',
  'rewards.loading': 'Loading the rewards…',
  'rewards.loadFailed': 'The rewards could not be loaded.',
  'rewards.saveFailed': 'That reward could not be saved.',
  'rewards.deleteFailed': 'That reward could not be deleted.',
  'rewards.unused': 'Not used',

  // -- Game module additions (F13 R11, R7) ----------------------------
  'game.losingToggle': 'Include a losing item',
  'game.losingToggleHint':
    'Adds a slice that wins nothing. Rename it and set its odds like any other.',
  'game.reward': 'Gives away',
  'game.noRewards': 'Add a reward first — every slice has to give something away.',
  // F14 R1, R3: what marks the losing row, and what stands where its
  // reward selector would be.
  'game.losingSlice': 'Losing item',
  'game.losingGivesNothing': 'Nothing — this is the losing item.',

  // -- Player result (F13 R20) ----------------------------------------
  'player.yourCode': 'Your code',

  // -- Branding addition (F13 R27) ------------------------------------
  'branding.currency': 'Currency',
} as const

export type MessageKey = keyof typeof en
