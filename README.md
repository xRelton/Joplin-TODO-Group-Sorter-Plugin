# Joplin Plugin

This is your new Joplin plugin. It is suggested that you use this README file to document your plugin.

For information on how to build or publish the plugin, please see [GENERATOR_DOC.md](./GENERATOR_DOC.md)

# Description

Plugin to group TODO lists inside Joplin notes and apply a sorting algorithm to them so that ticked items go to the bottom of the list.

The cursor-sort command operates through Joplin's CodeMirror 6 editor. It is available when a Markdown note is open in that editor; the legacy CodeMirror 5 editor is not supported.


# Feature list plan

v1 (the short-term target)

    - Group detection. A group is a run of list lines (-, * or +, with [ ], [x] or [X]) plus their indented children. It ends at a blank line, a non-list line or the end of the note. Fenced code blocks are ignored.
    - Sort group at cursor. One command, no selection needed.
    - Sort all groups in note.
    - Stable sort. Unchecked items first, checked last, with your manual order preserved within each.
    - Sub-task aware. Children travel with their parent, and siblings are sorted among themselves at every level. A parent’s own tick decides where it goes, and nothing auto-completes a parent when its children are all done.
    - Minimal, undoable edits. Only the changed lines are rewritten, the cursor stays put, and the whole sort undoes in one step.
    - Shortcuts and menu entries. Rebindable in Keyboard Shortcuts, so no more Ctrl+Alt clashes.
    - Move item up/down with its sub-tasks. This is a cheap stand-in for drag and drop, and better than the native Alt+Up/Down because it moves the whole subtree.

v1.1

    - Auto-sort toggle in plugin settings, off by default. When enabled, it re-sorts only the group where a checkbox state just changed, debounced, and never while you’re typing in a line.

v2 / stretch

    - Remember original positions so unticking restores the item to where it started.
    - Per-group opt-in via a marker, with a warning about Rich Text stripping it.