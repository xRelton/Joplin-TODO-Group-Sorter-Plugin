import { MarkdownEditorContentScriptModule, ContentScriptContext } from 'api/types';
import { sortAllTodoGroups, sortTopLevelGroupAtLine } from './todoGroups';

export default (_context: ContentScriptContext): MarkdownEditorContentScriptModule => ({
	plugin: (codeMirrorWrapper) => {
		if (!codeMirrorWrapper.cm6) {
			return;
		}

		codeMirrorWrapper.registerCommand('sortTodoGroupAtCursor', () => {
			const editor = codeMirrorWrapper.editor;
			const document = editor.state.doc;
			const cursor = editor.state.selection.main.head;
			const cursorLine = document.lineAt(cursor);
			const cursorLineIndex = cursorLine.number - 1;
			const lines = document.toString().split('\n');
			const result = sortTopLevelGroupAtLine(lines, cursorLineIndex);

			if (!result) {
				return false;
			}

			const replacementLines = result.lines.slice(
				result.group.startLine,
				result.group.endLine + 1,
			);
			const previousLines = lines.slice(
				result.group.startLine,
				result.group.endLine + 1,
			);

			if (
				replacementLines.length === previousLines.length &&
				replacementLines.every((line, index) => line === previousLines[index])
			) {
				return false;
			}

			const from = document.line(result.group.startLine + 1).from;
			const to = document.line(result.group.endLine + 1).to;
			const lineOffset = cursorLineIndex - result.group.startLine;
			const nextCursorLine = replacementLines[lineOffset];
			let nextCursor = from;

			for (let i = 0; i < lineOffset; i++) {
				nextCursor += replacementLines[i].length + 1;
			}
			nextCursor += Math.min(cursor - cursorLine.from, nextCursorLine.length);

			editor.dispatch({
				changes: {
					from,
					to,
					insert: replacementLines.join('\n'),
				},
				selection: {
					anchor: nextCursor,
					head: nextCursor,
				},
			});

			return true;
		});

		codeMirrorWrapper.registerCommand('sortTodoGroupsInNote', () => {
			const editor = codeMirrorWrapper.editor;
			const doc = editor.state.doc;
			const lines = doc.toString().split('\n');
			const result = sortAllTodoGroups(lines);
			const changes = result.changedGroups.map((group) => ({
				from: doc.line(group.startLine + 1).from,
				to: doc.line(group.endLine + 1).to,
				insert: result.lines.slice(group.startLine, group.endLine + 1).join('\n'),
			}));

			if (changes.length === 0) return false;

			// Apply bottom-up in one transaction. Because CodeMirror 6 resolves
			// simultaneous changes against the original document, we can pass all
			// of them in a single dispatch — one undo entry, no intermediate states.
			editor.dispatch({
				changes,
				selection: { anchor: changes[0].from, head: changes[0].from },
			});

			return true;
		});
	},
});
