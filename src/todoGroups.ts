// Group detection for todo lists inside a Markdown note.
//
// This file must NOT import anything from 'api' (Joplin), so that it can be
// unit tested on its own.

/**
 * A todo group, described by the lines it covers.
 * Line numbers are 0-based and both ends are inclusive.
 */
export interface TodoGroup {
	startLine: number;
	endLine: number;
}

interface Fence {
	char: string;
	length: number;
}

// Matches "- [ ] text", "* [x] text", "+ [X] text" (text is optional).
// Group 1 = indentation, group 2 = bullet, group 3 = checkbox state.
const TODO_REGEX = /^(\s*)([-*+])\s+\[([ xX])\](?:\s+(.*))?$/;

// Matches the start of a fenced code block (three or more ` or ~).
const FENCE_REGEX = /^\s*(`{3,}|~{3,})/;

// A tab counts as this many spaces when measuring indentation.
const TAB_WIDTH = 4;

/** Splits note text into lines, coping with both Windows and Unix line endings. */
export function splitLines(text: string): string[] {
	return text.split(/\r?\n/);
}

/** True if the line is a todo item, e.g. "- [ ] buy milk". */
export function isTodoLine(line: string): boolean {
	return TODO_REGEX.test(line);
}

/** Width of the leading whitespace of a line, with tabs expanded. */
export function indentWidth(line: string): number {
	let width = 0;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === ' ') {
			width += 1;
		} else if (ch === '\t') {
			width += TAB_WIDTH;
		} else {
			break;
		}
	}
	return width;
}

function isBlank(line: string): boolean {
	return line.trim() === '';
}

function isClosingFence(line: string, fence: Fence): boolean {
	const match = FENCE_REGEX.exec(line);
	if (!match) {
		return false;
	}
	const marker = match[1];
	return marker[0] === fence.char && marker.length >= fence.length && line.trim() === marker;
}

/**
 * Finds every todo group in a note.
 *
 * A group starts at a todo line and continues while each following line is:
 *   - a todo line at the same indentation as the first one (a sibling), or
 *   - any non-blank line indented deeper than the first one (a child).
 *
 * A group ends at a blank line, at a line that is not part of the list,
 * at a line indented less than the group, or at a fenced code block.
 */
export function findTodoGroups(lines: string[]): TodoGroup[] {
	const groups: TodoGroup[] = [];

	let fence: Fence | null = null;
	let groupStart = -1; // -1 means "no group is open"
	let groupEnd = -1;
	let groupIndent = 0;

	const closeGroup = (): void => {
		if (groupStart !== -1) {
			groups.push({ startLine: groupStart, endLine: groupEnd });
			groupStart = -1;
		}
	};

	const openGroup = (line: number, indent: number): void => {
		groupStart = line;
		groupEnd = line;
		groupIndent = indent;
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// 1. Inside a fenced code block: ignore everything until it closes.
		if (fence) {
			if (isClosingFence(line, fence)) {
				fence = null;
			}
			continue;
		}

		// 2. Start of a fenced code block: ends any open group.
		const fenceMatch = FENCE_REGEX.exec(line);
		if (fenceMatch) {
			closeGroup();
			fence = { char: fenceMatch[1][0], length: fenceMatch[1].length };
			continue;
		}

		// 3. A blank line always ends a group.
		if (isBlank(line)) {
			closeGroup();
			continue;
		}

		const indent = indentWidth(line);
		const todo = isTodoLine(line);

		// 4. No open group: a todo line starts one, anything else is ignored.
		if (groupStart === -1) {
			if (todo) {
				openGroup(i, indent);
			}
			continue;
		}

		// 5. A group is open: decide whether this line belongs to it.
		if (indent > groupIndent) {
			groupEnd = i; // child content (a sub-task, a sub-bullet, or a note)
		} else if (indent === groupIndent && todo) {
			groupEnd = i; // a sibling todo
		} else {
			closeGroup();
			if (todo) {
				openGroup(i, indent); // e.g. a todo at a shallower indent starts a new group
			}
		}
	}

	closeGroup();
	return groups;
}

/** Returns the group that contains the given line, if any. */
export function findGroupAtLine(groups: TodoGroup[], line: number): TodoGroup | undefined {
	return groups.find((group) => line >= group.startLine && line <= group.endLine);
}