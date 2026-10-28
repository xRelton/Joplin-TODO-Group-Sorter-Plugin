import { describe, it, expect } from 'vitest';
import {
	findTodoGroups,
	findGroupAtLine,
	findTodoItems,
	moveTodoItemAtLine,
	normalizeUppercaseCheckedMarkers,
	sortAllTodoGroups,
	sortTodoGroupsAtLines,
	sortTodoGroupAtLine,
	splitLines,
} from '../src/todoGroups';

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

describe('normalizeUppercaseCheckedMarkers', () => {
	it('lowercases uppercase checked markers in todo groups only', () => {
		const lines = [
			'```md',
			'- [X] code sample',
			'```',
			'- [X] checked task',
			'  - [X] checked subtask',
			'',
			'Plain [X] text',
		];

		expect(normalizeUppercaseCheckedMarkers(lines)).toEqual([
			'```md',
			'- [X] code sample',
			'```',
			'- [x] checked task',
			'  - [x] checked subtask',
			'',
			'Plain [X] text',
		]);
	});

	it('leaves lines unchanged when there are no uppercase checked tasks', () => {
		const lines = ['- [ ] open', '- [x] checked'];
		expect(normalizeUppercaseCheckedMarkers(lines)).toEqual(lines);
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

describe('sortTodoGroupAtLine', () => {
	it('stably moves checked tasks to the bottom with their indented content', () => {
		const lines = [
			'- [x] completed',
			'  - [ ] child',
			'- [ ] first open',
			'  supporting note',
			'- [ ] second open',
		];

		expect(sortTodoGroupAtLine(lines, 1)).toEqual({
			lines: [
				'- [ ] first open',
				'  supporting note',
				'- [ ] second open',
				'- [x] completed',
				'  - [ ] child',
			],
			group: { startLine: 0, endLine: 4 },
			change: {
				startLine: 0,
				endLine: 4,
				replacementLines: [
					'- [ ] first open',
					'  supporting note',
					'- [ ] second open',
					'- [x] completed',
					'  - [ ] child',
				],
			},
		});
	});

	it('keeps task order stable within checked and unchecked partitions', () => {
		const lines = [
			'- [x] done first',
			'- [ ] open first',
			'- [X] done second',
			'- [ ] open second',
		];

		expect(sortTodoGroupAtLine(lines, 0)?.lines).toEqual([
			'- [ ] open first',
			'- [ ] open second',
			'- [x] done first',
			'- [X] done second',
		]);
	});

	it('returns undefined when the cursor is outside a todo group', () => {
		expect(sortTodoGroupAtLine(['plain text', '- [ ] task'], 0)).toBeUndefined();
	});
});

describe('findTodoItems', () => {
	it('builds a task hierarchy with inclusive source line ranges', () => {
		const lines = [
			'- [ ] parent',
			'  - [x] child',
			'    - [ ] grandchild',
			'- [x] sibling',
		];
		const group = findTodoGroups(lines)[0];

		expect(findTodoItems(lines, group)).toEqual([
			{
				startLine: 0,
				endLine: 2,
				indent: 0,
				checked: false,
				children: [
					{
						startLine: 1,
						endLine: 2,
						indent: 2,
						checked: true,
						children: [
							{
								startLine: 2,
								endLine: 2,
								indent: 4,
								checked: false,
								children: [],
							},
						],
					},
				],
			},
			{
				startLine: 3,
				endLine: 3,
				indent: 0,
				checked: true,
				children: [],
			},
		]);
	});
});

describe('moveTodoItemAtLine', () => {
	it('moves a task and its entire subtree down among top-level siblings', () => {
		const lines = [
			'- [ ] first',
			'  - [x] child',
			'    - [ ] grandchild',
			'- [ ] second',
		];

		expect(moveTodoItemAtLine(lines, 0, 1)).toEqual({
			lines: [
				'- [ ] second',
				'- [ ] first',
				'  - [x] child',
				'    - [ ] grandchild',
			],
			change: {
				startLine: 0,
				endLine: 3,
				replacementLines: [
					'- [ ] second',
					'- [ ] first',
					'  - [x] child',
					'    - [ ] grandchild',
				],
			},
			lineMappings: [
				{ startLine: 0, endLine: 2, newStartLine: 1 },
				{ startLine: 3, endLine: 3, newStartLine: 0 },
			],
		});
	});

	it('moves a nested task only among its siblings', () => {
		const lines = [
			'- [ ] parent',
			'  - [x] checked child',
			'    - [ ] checked child subtask',
			'  - [ ] open child',
			'    - [x] open child subtask',
			'- [ ] next parent',
		];

		expect(moveTodoItemAtLine(lines, 3, -1)).toEqual({
			lines: [
				'- [ ] parent',
				'  - [ ] open child',
				'    - [x] open child subtask',
				'  - [x] checked child',
				'    - [ ] checked child subtask',
				'- [ ] next parent',
			],
			change: {
				startLine: 1,
				endLine: 4,
				replacementLines: [
					'  - [ ] open child',
					'    - [x] open child subtask',
					'  - [x] checked child',
					'    - [ ] checked child subtask',
				],
			},
			lineMappings: [
				{ startLine: 3, endLine: 4, newStartLine: 1 },
				{ startLine: 1, endLine: 2, newStartLine: 3 },
			],
		});
	});

	it('advances the cursor across identical siblings so they do not trap movement', () => {
		const lines = ['- [ ] sd', '- [ ] sd', '- [ ] next'];
		const result = moveTodoItemAtLine(lines, 0, 1);

		expect(result).toEqual({
			lines,
			change: undefined,
			lineMappings: [
				{ startLine: 0, endLine: 0, newStartLine: 1 },
				{ startLine: 1, endLine: 1, newStartLine: 0 },
			],
		});

		const secondMove = moveTodoItemAtLine(lines, 1, 1);
		expect(secondMove?.lines).toEqual(['- [ ] sd', '- [ ] next', '- [ ] sd']);
		expect(secondMove?.lineMappings[0]).toEqual({
			startLine: 1,
			endLine: 1,
			newStartLine: 2,
		});
	});

	it('does not cross parent or group boundaries', () => {
		const lines = [
			'- [ ] parent',
			'  - [ ] only child',
			'',
			'- [ ] separate group task',
		];

		expect(moveTodoItemAtLine(lines, 1, -1)).toBeUndefined();
		expect(moveTodoItemAtLine(lines, 1, 1)).toBeUndefined();
		expect(moveTodoItemAtLine(lines, 0, -1)).toBeUndefined();
		expect(moveTodoItemAtLine(lines, 3, 1)).toBeUndefined();
	});

	it('returns undefined when the cursor is outside a todo group', () => {
		expect(moveTodoItemAtLine(['plain text', '', '- [ ] task'], 0, 1)).toBeUndefined();
	});
});

describe('sortAllTodoGroups', () => {
	it('sorts each group independently and preserves text between groups', () => {
		const lines = [
			'# Tasks',
			'- [x] first done',
			'- [ ] first open',
			'',
			'Keep this note between groups.',
			'',
			'- [X] second done',
			'- [ ] second open',
			'  - [x] child stays attached',
			'## End',
		];

		expect(sortAllTodoGroups(lines)).toEqual({
			lines: [
				'# Tasks',
				'- [ ] first open',
				'- [x] first done',
				'',
				'Keep this note between groups.',
				'',
				'- [ ] second open',
				'  - [x] child stays attached',
				'- [X] second done',
				'## End',
			],
			changedGroups: [
				{ startLine: 1, endLine: 2 },
				{ startLine: 6, endLine: 8 },
			],
			changes: [
				{
					startLine: 1,
					endLine: 2,
					replacementLines: ['- [ ] first open', '- [x] first done'],
				},
				{
					startLine: 6,
					endLine: 8,
					replacementLines: [
						'- [ ] second open',
						'  - [x] child stays attached',
						'- [X] second done',
					],
				},
			],
		});
	});

	it('sorts siblings recursively while keeping each child subtree with its parent', () => {
		const lines = [
			'- [ ] parent',
			'  - [x] child done first',
			'    - [x] grandchild done',
			'    - [ ] grandchild open',
			'  - [x] child done second',
			'  - [ ] child open first',
			'  - [ ] child open second',
			'- [x] completed parent',
			'  - [ ] its child remains attached',
		];

		expect(sortAllTodoGroups(lines).lines).toEqual([
			'- [ ] parent',
			'  - [ ] child open first',
			'  - [ ] child open second',
			'  - [x] child done first',
			'    - [ ] grandchild open',
			'    - [x] grandchild done',
			'  - [x] child done second',
			'- [x] completed parent',
			'  - [ ] its child remains attached',
		]);
	});

	it('reports only the changed line span, preserving an unchanged group prefix', () => {
		const lines = ['- [ ] unchanged', '- [x] done', '- [ ] open'];

		expect(sortAllTodoGroups(lines)).toEqual({
			lines: ['- [ ] unchanged', '- [ ] open', '- [x] done'],
			changedGroups: [{ startLine: 0, endLine: 2 }],
			changes: [{
				startLine: 1,
				endLine: 2,
				replacementLines: ['- [ ] open', '- [x] done'],
			}],
		});
	});

	it('returns unchanged lines when there are no groups', () => {
		const lines = ['# Note', 'plain text', '', '```', '- [ ] code', '```'];

		expect(sortAllTodoGroups(lines)).toEqual({
			lines,
			changedGroups: [],
			changes: [],
		});
	});

	it('reports no changed groups when all groups are already sorted', () => {
		const lines = ['- [ ] open', '- [x] done', '', '- [ ] another open'];

		expect(sortAllTodoGroups(lines)).toEqual({
			lines,
			changedGroups: [],
			changes: [],
		});
	});
});

describe('sortTodoGroupsAtLines', () => {
	it('sorts only the group containing a toggled checkbox line', () => {
		const lines = [
			'- [x] first done',
			'- [ ] first open',
			'',
			'- [x] second done',
			'- [ ] second open',
		];

		expect(sortTodoGroupsAtLines(lines, [4])).toEqual({
			lines: [
				'- [x] first done',
				'- [ ] first open',
				'',
				'- [ ] second open',
				'- [x] second done',
			],
			changedGroups: [{ startLine: 3, endLine: 4 }],
			changes: [{
				startLine: 3,
				endLine: 4,
				replacementLines: ['- [ ] second open', '- [x] second done'],
			}],
		});
	});

	it('sorts a touched group only once when several of its tasks were toggled', () => {
		const lines = ['- [x] done', '- [ ] open', '', '- [ ] separate'];

		expect(sortTodoGroupsAtLines(lines, [0, 1])).toEqual({
			lines: ['- [ ] open', '- [x] done', '', '- [ ] separate'],
			changedGroups: [{ startLine: 0, endLine: 1 }],
			changes: [{
				startLine: 0,
				endLine: 1,
				replacementLines: ['- [ ] open', '- [x] done'],
			}],
		});
	});

	it('returns no changes when no target line belongs to a todo group', () => {
		const lines = ['ordinary text', '', '- [x] done'];

		expect(sortTodoGroupsAtLines(lines, [0])).toEqual({
			lines,
			changedGroups: [],
			changes: [],
		});
	});
});
