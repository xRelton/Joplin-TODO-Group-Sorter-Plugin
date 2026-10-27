/*import joplin from 'api';

joplin.plugins.register({
	onStart: async function() {
		// eslint-disable-next-line no-console
		console.info('Hello world. Test plugin started!');
	},
});*/

import joplin from 'api';
import { findTodoGroups, splitLines } from './todoGroups';

joplin.plugins.register({
	onStart: async function () {
		const logGroups = async () => {
			const note = await joplin.workspace.selectedNote();
			if (!note) {
				return;
			}
			const groups = findTodoGroups(splitLines(note.body));
			console.info('Todo groups:', JSON.stringify(groups));
		};

		await joplin.workspace.onNoteSelectionChange(logGroups);
		await joplin.workspace.onNoteChange(logGroups);
		await logGroups();
	},
});