
function getInputEnd(element: HTMLTextAreaElement, previous: string, value: string): number | null {
  var end = value.length - element.selectionStart;
  if (end === 0) return end;
  if (previous.slice(previous.length - end) !== value.slice(value.length - end)) return null;
  return end;
};

export type Op = {
  start: number, inserted?: string, removed?: string
}

export function opFromInput(element: HTMLTextAreaElement, previous: string): Op | null {
  var value = element.value;
  if (previous === value) return null;

  var start = 0;
  // Attempt to use the DOM cursor position to find the end
  var end = getInputEnd(element, previous, value);
  if (end === null) {
    // If we failed to find the end based on the cursor, do a diff. When
    // ambiguous, prefer to locate ops at the end of the string, since users
    // more frequently add or remove from the end of a text input
    while (previous.charAt(start) === value.charAt(start)) {
      start++;
    }
    end = 0;
    while (
      previous.charAt(previous.length - 1 - end) === value.charAt(value.length - 1 - end) &&
      end + start < previous.length &&
      end + start < value.length
    ) {
      end++;
    }
  } else {
    while (
      previous.charAt(start) === value.charAt(start) &&
      start + end < previous.length &&
      start + end < value.length
    ) {
      start++;
    }
  }

  const op: Op = { start }
  if (previous.length !== start + end) {
    var removed = previous.slice(start, previous.length - end);
    op.removed = removed
  }
  if (value.length !== start + end) {
    var inserted = value.slice(start, value.length - end);
    op.inserted = inserted
  }
  return op
}

/*
TextDiffBinding.prototype.onInsert = function(index, length) {
  this._transformSelectionAndUpdate(index, length, insertCursorTransform);
};
function insertCursorTransform(index, length, cursor) {
  return (index < cursor) ? cursor + length : cursor;
}

TextDiffBinding.prototype.onRemove = function(index, length) {
  this._transformSelectionAndUpdate(index, length, removeCursorTransform);
};
function removeCursorTransform(index, length, cursor) {
  return (index < cursor) ? cursor - Math.min(length, cursor - index) : cursor;
}

TextDiffBinding.prototype._transformSelectionAndUpdate = function(index, length, transformCursor) {
  if (document.activeElement === this.element) {
    var selectionStart = transformCursor(index, length, this.element.selectionStart);
    var selectionEnd = transformCursor(index, length, this.element.selectionEnd);
    var selectionDirection = this.element.selectionDirection;
    this.update();
    this.element.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
  } else {
    this.update();
  }
};

TextDiffBinding.prototype.update = function() {
  var value = this._get();
  if (this._getElementValue() === value) return;
  this.element.value = value;
};
*/