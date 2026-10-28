import { MarkdownEditorContentScriptModule, ContentScriptContext } from 'api/types';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { Transaction } from '@codemirror/state';
import {
	splitLines,
	findTodoGroups,
	normalizeUppercaseCheckedMarkers,
	moveTodoItemAtLine,
	sortAllTodoGroups,
	sortTodoGroupsAtLines,
	sortTodoGroupAtLine,
	TodoLineMapping,
	TodoLineChange,
} from './todoGroups';
import { findToggledLines } from './checkboxToggles';

interface EditorLine {
	number: number;
	from: number;
}

interface EditorDocument {
	lineAt(position: number): EditorLine;
	line(number: number): EditorLine;
}

function normalizeUppercaseCheckboxMarkers(editor: any): void {
	const document = editor.state.doc;
	const lines = splitLines(document.toString());
	const normalizedLines = normalizeUppercaseCheckedMarkers(lines);
	const changes: { from: number; to: number; insert: string }[] = [];

	for (const group of findTodoGroups(lines)) {
		for (let lineIndex = group.startLine; lineIndex <= group.endLine; lineIndex++) {
			if (lines[lineIndex] === normalizedLines[lineIndex]) {
				continue;
			}

			const marker = /^(\s*[-*+]\s+\[)X(\])/.exec(lines[lineIndex]);
			if (!marker) {
				continue;
			}

			const from = document.line(lineIndex + 1).from + marker[1].length;
			changes.push({ from, to: from + 1, insert: 'x' });
		}
	}

	if (changes.length > 0) {
		editor.dispatch({
			changes,
			annotations: Transaction.addToHistory.of(false),
		});
	}
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

function dispatchLineChange(
	editor: any,
	document: any,
	lines: string[],
	change: TodoLineChange,
	lineMappings: TodoLineMapping[] = [],
): void {
	const selection = editor.state.selection.main;
	const anchor = lineColumnAt(document, selection.anchor);
	const head = lineColumnAt(document, selection.head);
	const mapPosition = (position: { line: number; column: number }): number => {
		const mapping = lineMappings.find(
			(candidate) => position.line >= candidate.startLine && position.line <= candidate.endLine,
		);
		const mappedLine = mapping
			? mapping.newStartLine + position.line - mapping.startLine
			: position.line;
		return positionAtLineColumn(lines, mappedLine, position.column);
	};

	const selectionUpdate = {
		anchor: mapPosition(anchor),
		head: mapPosition(head),
	};
	if (change) {
		editor.dispatch({
			changes: {
				from: document.line(change.startLine + 1).from,
				to: document.line(change.endLine + 1).to,
				insert: change.replacementLines.join('\n'),
			},
			selection: selectionUpdate,
		});
	} else {
		editor.dispatch({ selection: selectionUpdate });
	}
}

export default (_context: ContentScriptContext): MarkdownEditorContentScriptModule => ({
	plugin: (codeMirrorWrapper) => {
		if (!codeMirrorWrapper.cm6) {
			return;
		}

		const editor = codeMirrorWrapper.editor;
		normalizeUppercaseCheckboxMarkers(editor);

		codeMirrorWrapper.registerCommand('sortTodoGroupAtCursor', () => {
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

		const registerMoveCommand = (name: string, direction: -1 | 1): void => {
			codeMirrorWrapper.registerCommand(name, () => {
				const document = editor.state.doc;
				const lines = document.toString().split('\n');
				const cursorLine = lineColumnAt(
					document,
					editor.state.selection.main.head,
				).line;
				const result = moveTodoItemAtLine(lines, cursorLine, direction);

				if (!result) {
					return false;
				}

				dispatchLineChange(
					editor,
					document,
					result.lines,
					result.change,
					result.lineMappings,
				);
				return true;
			});
		};

		registerMoveCommand('moveTodoItemUp', -1);
		registerMoveCommand('moveTodoItemDown', 1);

		let enabled = false;
		let delayMs = 600;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let pending: number[] = [];
		let settingsRequestId = 0;

		codeMirrorWrapper.addExtension(EditorView.updateListener.of((update) => {
			if (!update.docChanged) {
				return;
			}

			void Promise.resolve().then(() => normalizeUppercaseCheckboxMarkers(editor));

			pending = pending.map((pos) => update.changes.mapPos(pos, -1));
			const isUndoOrRedo = update.transactions.some((transaction: Transaction) =>
				transaction.isUserEvent('undo') || transaction.isUserEvent('redo'),
			);
			if (isUndoOrRedo) {
				if (timer) {
					clearTimeout(timer);
					timer = undefined;
				}
				pending = [];
				settingsRequestId++;
				return;
			}

			if (update.transactions.some((transaction: Transaction) =>
				transaction.isUserEvent('todoSort'),
			)) {
				return;
			}

			const toggledLines = findToggledLines(
				splitLines(update.startState.doc.toString()),
				splitLines(update.state.doc.toString()),
			);
			pending.push(...toggledLines.map((line) => update.state.doc.line(line + 1).from));

			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			if (pending.length === 0) {
				return;
			}

			const requestId = ++settingsRequestId;
			void _context.postMessage('getAutoSortSettings').then((settings) => {
				if (requestId !== settingsRequestId) {
					return;
				}

				if (
					!settings ||
					typeof settings.autoSort !== 'boolean' ||
					typeof settings.autoSortDelayMs !== 'number'
				) {
					console.error('TODO Group Sorter received invalid auto-sort settings.');
					pending = [];
					return;
				}

				enabled = settings.autoSort;
				delayMs = Math.max(0, settings.autoSortDelayMs);
				if (!enabled) {
					pending = [];
					return;
				}

				timer = setTimeout(runPending, delayMs);
			}).catch((error: unknown) => {
				if (requestId !== settingsRequestId) {
					return;
				}

				console.error('TODO Group Sorter could not read auto-sort settings:', error);
				pending = [];
			});
		}));

		const runPending = () => {
			timer = undefined;
			if (!enabled || pending.length === 0) {
				return;
			}

			const view = editor;
			const doc = view.state.doc;
			const lines = splitLines(doc.toString());
			const positions = pending;
			pending = [];

			const targetLines = [...new Set(positions.map((position) =>
				doc.lineAt(Math.min(position, doc.length)).number - 1,
			))];
			const result = sortTodoGroupsAtLines(lines, targetLines);
			if (result.changes.length === 0) {
				return;
			}

			view.dispatch({
				changes: result.changes.map((change) => ({
					from: doc.line(change.startLine + 1).from,
					to: doc.line(change.endLine + 1).to,
					insert: change.replacementLines.join('\n'),
				})),
				annotations: Transaction.userEvent.of('todoSort'),
			});
		};
	},
});
