import joplin from 'api';
import { ContentScriptType, MenuItem, MenuItemLocation } from 'api/types';

const sortAtCursorCommand = 'com.ori.todo-group-sorter.sortAtCursor';
const sortInNoteCommand = 'com.ori.todo-group-sorter.sortInNote';
const moveItemUpCommand = 'com.ori.todo-group-sorter.moveItemUp';
const moveItemDownCommand = 'com.ori.todo-group-sorter.moveItemDown';

joplin.plugins.register({
	onStart: async function () {
		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'com.ori.todo-group-sorter.cm6',
			'./contentScript.js',
		);

		await joplin.commands.register({
			name: sortAtCursorCommand,
			label: 'TODO Group Sorter: Sort group at cursor',
			//iconName: 'fas fa-rocket', // Optional FontAwesome icon
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'sortTodoGroupAtCursor',
					args: [],
				});
			},
			enabledCondition: 'noteIsMarkdown',
		});

		await joplin.commands.register({
			name: sortInNoteCommand,
			label: 'TODO Group Sorter: Sort all groups in note',
			//iconName: 'fas fa-rocket', // Optional FontAwesome icon
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'sortTodoGroupsInNote',
					args: [],
				});
			},
			enabledCondition: 'noteIsMarkdown',
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