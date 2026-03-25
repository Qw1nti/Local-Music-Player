// IPC channels/events for the settings system (shared between main and preload).

export const SETTINGS_IPC = {
  channels: {
    get: 'settings:get',
    update: 'settings:update',
    reset: 'settings:reset'
  },
  events: {
    changed: 'settings:changed'
  }
};

export const APP_IPC = {
  channels: {
    openPreferences: 'app:open-preferences'
  }
};

