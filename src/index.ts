/*import joplin from 'api';

joplin.plugins.register({
	onStart: async function() {
		// eslint-disable-next-line no-console
		console.info('Hello world. Test plugin started!');
	},
});*/

import joplin from 'api';
import { ContentScriptType, MenuItemLocation } from 'api/types';

const sortAtCursorCommand = 'com.ori.todo-group-sorter.sortAtCursor';
const sortInNoteCommand = 'com.ori.todo-group-sorter.sortInNote';

joplin.plugins.register({
	onStart: async function () {
		console.info('Hello world. TODO Group Sorter plugin started!');

		await joplin.contentScripts.register(
			ContentScriptType.CodeMirrorPlugin,
			'com.ori.todo-group-sorter.cm6',
			'./contentScript.js',
		);

		await joplin.commands.register({
			name: sortAtCursorCommand,
			label: 'Sort TODO group at cursor',
			//iconName: 'fas fa-rocket', // Optional FontAwesome icon
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'sortTodoGroupAtCursor',
					args: [],
				});
			},
		});

		await joplin.commands.register({
			name: sortInNoteCommand,
			label: 'Sort all TODO groups in note',
			//iconName: 'fas fa-rocket', // Optional FontAwesome icon
			execute: async () => {
				await joplin.commands.execute('editor.execCommand', {
					name: 'sortTodoGroupsInNote',
					args: [],
				});
			},
		});

		const groupMenuItems = [
            { commandName: sortAtCursorCommand },
            { commandName: sortInNoteCommand }
        ];

        await joplin.views.menus.create(
            'todo-group-sorter-menu',
            'TODO Group Sorter',
            groupMenuItems,
            MenuItemLocation.Tools
        );
	},
});