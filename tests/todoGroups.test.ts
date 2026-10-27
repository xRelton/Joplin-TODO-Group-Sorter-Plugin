import { describe, it, expect } from 'vitest';
import { findTodoGroups, findGroupAtLine, splitLines } from '../src/todoGroups';

describe('findTodoGroups', () => {
	it('finds a single group and ignores surrounding text', () => {
		const lines = [
			'# Shopping', // 0
			'- [ ] milk', // 1
			'- [x] eggs', // 2
			'- [ ] bread', // 3
			'', // 4
			'Some text', // 5
		];
		expect(findTodoGroups(lines)).toEqual([{ startLine: 1, endLine: 3 }]);
	});

	it('splits groups at a blank line', () => {
		const lines = [
			'- [ ] a', // 0
			'- [x] b', // 1
			'', // 2
			'- [ ] c', // 3
		];
		expect(findTodoGroups(lines)).toEqual([
			{ startLine: 0, endLine: 1 },
			{ startLine: 3, endLine: 3 },
		]);
	});

	it('keeps sub-tasks inside their group', () => {
		const lines = [
			'- [ ] parent', // 0
			'  - [x] child 1', // 1
			'  - [ ] child 2', // 2
			'    - [ ] grandchild', // 3
			'- [x] other', // 4
		];
		expect(findTodoGroups(lines)).toEqual([{ startLine: 0, endLine: 4 }]);
	});

	it('treats a tab as indentation', () => {
		const lines = ['- [ ] parent', '\t- [ ] child'];
		expect(findTodoGroups(lines)).toEqual([{ startLine: 0, endLine: 1 }]);
	});

	it('ends a group at a heading or other non-list line', () => {
		const lines = [
			'- [ ] a', // 0
			'## Next', // 1
			'- [ ] b', // 2
		];
		expect(findTodoGroups(lines)).toEqual([
			{ startLine: 0, endLine: 0 },
			{ startLine: 2, endLine: 2 },
		]);
	});

	it('ends a group at a plain bullet at the same level', () => {
		const lines = [
			'- [ ] a', // 0
			'- note', // 1
			'- [ ] b', // 2
		];
		expect(findTodoGroups(lines)).toEqual([
			{ startLine: 0, endLine: 0 },
			{ startLine: 2, endLine: 2 },
		]);
	});

	it('supports *, + and - bullets and upper-case X', () => {
		const lines = ['* [ ] a', '+ [X] b', '- [x] c'];
		expect(findTodoGroups(lines)).toEqual([{ startLine: 0, endLine: 2 }]);
	});

	it('does not treat "[x]text" (no space) as a todo', () => {
		expect(findTodoGroups(['- [x]text'])).toEqual([]);
	});

	it('handles a todo list nested inside a normal bullet list', () => {
		const lines = [
			'- Project', // 0
			'  - [ ] a', // 1
			'  - [x] b', // 2
			'- Other', // 3
		];
		expect(findTodoGroups(lines)).toEqual([{ startLine: 1, endLine: 2 }]);
	});

	it('ignores todo-like lines inside fenced code blocks', () => {
		const lines = [
			'```', // 0
			'- [ ] not a task', // 1
			'```', // 2
			'- [ ] real task', // 3
		];
		expect(findTodoGroups(lines)).toEqual([{ startLine: 3, endLine: 3 }]);
	});

	it('ends an open group when a fenced code block starts', () => {
		const lines = [
			'- [ ] a', // 0
			'```', // 1
			'code', // 2
			'```', // 3
			'- [ ] b', // 4
		];
		expect(findTodoGroups(lines)).toEqual([
			{ startLine: 0, endLine: 0 },
			{ startLine: 4, endLine: 4 },
		]);
	});

	it('copes with Windows line endings', () => {
		const lines = splitLines('- [ ] a\r\n- [x] b\r\n\r\n- [ ] c');
		expect(findTodoGroups(lines)).toEqual([
			{ startLine: 0, endLine: 1 },
			{ startLine: 3, endLine: 3 },
		]);
	});

	it('returns an empty list when there are no todos', () => {
		expect(findTodoGroups(['hello', '', '- just a bullet'])).toEqual([]);
	});
});

describe('findGroupAtLine', () => {
	const groups = [
		{ startLine: 0, endLine: 1 },
		{ startLine: 3, endLine: 3 },
	];

	it('finds the group containing a line', () => {
		expect(findGroupAtLine(groups, 0)).toEqual({ startLine: 0, endLine: 1 });
		expect(findGroupAtLine(groups, 3)).toEqual({ startLine: 3, endLine: 3 });
	});

	it('returns undefined for a line outside any group', () => {
		expect(findGroupAtLine(groups, 2)).toBeUndefined();
	});
});