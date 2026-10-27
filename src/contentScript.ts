import { MarkdownEditorContentScriptModule, ContentScriptContext } from 'api/types';
import { sortAllTodoGroups, sortTodoGroupAtLine } from './todoGroups';

interface EditorLine {
	number: number;
	from: number;
}

interface EditorDocument {
	lineAt(position: number): EditorLine;
}

function lineColumnAt(
	document: EditorDocument,
	position: number,
): { line: number; column: number } {
	const line = document.lineAt(position);
	return { line: line.number - 1, column: position - line.from };
}

function positionAtLineColumn(lines: string[], line: number, column: number): number {
	let position = 0;
	for (let i = 0; i < line; i++) {
		position += lines[i].length + 1;
	}
	return position + Math.min(column, lines[line]?.length ?? 0);
}

export default (_context: ContentScriptContext): MarkdownEditorContentScriptModule => ({
	plugin: (codeMirrorWrapper) => {
		if (!codeMirrorWrapper.cm6) {
			return;
		}

		codeMirrorWrapper.registerCommand('sortTodoGroupAtCursor', () => {
			const editor = codeMirrorWrapper.editor;
			const document = editor.state.doc;
			const cursor = editor.state.selection.main.head;
			const anchor = editor.state.selection.main.anchor;
			const cursorPosition = lineColumnAt(document, cursor);
			const anchorPosition = lineColumnAt(document, anchor);
			const lines = document.toString().split('\n');
			const result = sortTodoGroupAtLine(lines, cursorPosition.line);

			if (!result || !result.change) {
				return false;
			}

			editor.dispatch({
				changes: {
					from: document.line(result.change.startLine + 1).from,
					to: document.line(result.change.endLine + 1).to,
					insert: result.change.replacementLines.join('\n'),
				},
				selection: {
					anchor: positionAtLineColumn(
						result.lines,
						anchorPosition.line,
						anchorPosition.column,
					),
					head: positionAtLineColumn(
						result.lines,
						cursorPosition.line,
						cursorPosition.column,
					),
				},
			});

			return true;
		});

		codeMirrorWrapper.registerCommand('sortTodoGroupsInNote', () => {
			const editor = codeMirrorWrapper.editor;
			const doc = editor.state.doc;
			const lines = doc.toString().split('\n');
			const result = sortAllTodoGroups(lines);
			if (result.changes.length === 0) return false;

			const selection = editor.state.selection.main;
			const anchor = lineColumnAt(doc, selection.anchor);
			const head = lineColumnAt(doc, selection.head);
			const changes = result.changes.map((change) => ({
				from: doc.line(change.startLine + 1).from,
				to: doc.line(change.endLine + 1).to,
				insert: change.replacementLines.join('\n'),
			}));

			editor.dispatch({
				changes,
				selection: {
					anchor: positionAtLineColumn(result.lines, anchor.line, anchor.column),
					head: positionAtLineColumn(result.lines, head.line, head.column),
				},
			});

			return true;
		});
	},
});
