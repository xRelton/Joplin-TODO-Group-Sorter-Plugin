import joplin from 'api';
import { ContentScriptType, MenuItem, MenuItemLocation, SettingItemType } from 'api/types';

const sortAtCursorCommand = 'com.xrelton.todo-group-sorter.sortAtCursor';
const sortInNoteCommand = 'com.xrelton.todo-group-sorter.sortInNote';
const moveItemUpCommand = 'com.xrelton.todo-group-sorter.moveItemUp';
const moveItemDownCommand = 'com.xrelton.todo-group-sorter.moveItemDown';

joplin.plugins.register({
	onStart: async function () {
		await joplin.settings.registerSection('todoGroupSorter', {
			label: 'TODO Group Sorter',
		});

		await joplin.settings.registerSettings({
			autoSort: {
				section: 'todoGroupSorter',
				public: true,
				type: SettingItemType.Bool,
				value: false,
				label: 'Auto-sort when a checkbox is toggled',
			},
			autoSortDelayMs: {
				section: 'todoGroupSorter',
				public: true,
				type: SettingItemType.Int,
				value: 50,
				label: 'Auto-sort delay (ms)',
			},
		});

		await joplin.contentScripts.onMessage('com.xrelton.todo-group-sorter.cm6', async (message) => {
			if (message !== 'getAutoSortSettings') {
				return undefined;
			}
			return joplin.settings.values(['autoSort', 'autoSortDelayMs']);
		});

		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'com.xrelton.todo-group-sorter.cm6',
			'./contentScript.js',
		);

		await joplin.commands.register({
			name: sortAtCursorCommand,
			label: 'TODO Group Sorter: Sort group at cursor',
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'sortTodoGroupAtCursor',
					args: [],
				});
			},
		});

		await joplin.commands.register({
			name: sortInNoteCommand,
			label: 'TODO Group Sorter: Sort all groups in note',
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'sortTodoGroupsInNote',
					args: [],
				});
			},
		});

		await joplin.commands.register({
			name: moveItemUpCommand,
			label: 'TODO Group Sorter: Move item up',
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'moveTodoItemUp',
					args: [],
				});
			},
		});

		await joplin.commands.register({
			name: moveItemDownCommand,
			label: 'TODO Group Sorter: Move item down',
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'moveTodoItemDown',
					args: [],
				});
			},
		});

		/*await joplin.commands.register({
			name: 'myPluginMenuSeparator',
			execute: async () => {
				// This command is just a placeholder for the menu separator, so it doesn't need to do anything
			}
		});*/

		const hiddenLocation = MenuItemLocation.Context; // Hack to hide the menu items from the main menu, since Joplin currently doesn't support hidden menu items

		await joplin.views.menuItems.create('todo-group-sorter-on-cursor', sortAtCursorCommand, hiddenLocation,	{ accelerator: '' }, );
		await joplin.views.menuItems.create('todo-group-sorter-in-note', sortInNoteCommand, hiddenLocation, { accelerator: 'CmdOrCtrl+J' }, );
		await joplin.views.menuItems.create('todo-group-sorter-item-up', moveItemUpCommand, hiddenLocation, { accelerator: 'CmdOrCtrl+Up' }, );
		await joplin.views.menuItems.create('todo-group-sorter-item-down', moveItemDownCommand, hiddenLocation, { accelerator: 'CmdOrCtrl+Down' }, );

		const groupMenuItems: MenuItem[] = [
			{ commandName: sortAtCursorCommand },
			{ commandName: sortInNoteCommand },
			// Apparently the Joplin separators are currently not working in the menu, so I will just leave it out for now
			//{ type: 'separator', commandName: 'myPluginMenuSeparator' },
			{ commandName: moveItemUpCommand },
			{ commandName: moveItemDownCommand },
		 ];

		await joplin.views.menus.create('todo-group-sorter-menu', 'TODO Group Sorter', groupMenuItems, MenuItemLocation.Tools);
	},
});