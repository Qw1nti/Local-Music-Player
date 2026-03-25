/**
 * Minimal application menu for desktop-grade UX.
 *
 * Adds a Preferences entry (Cmd+,) similar to other macOS apps.
 */

import { Menu } from 'electron';
import { openPreferencesFromMenu } from './ipc/app-ipc.js';

export function setAppMenu() {
  const template = [
    {
      label: 'App',
      submenu: [
        { label: 'Preferences…', accelerator: 'CommandOrControl+,', click: () => openPreferencesFromMenu() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

