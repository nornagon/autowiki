import React, { forwardRef } from 'react';

function ExpandingTextAreaUnforwarded(opts: React.DetailedHTMLProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>, HTMLTextAreaElement>, ref: any) {
  return (
    <div className="expandingArea">
      <pre><span>{opts.value}</span><br/></pre>
      <textarea {...opts} ref={ref}></textarea>
    </div>
  )
}
export const ExpandingTextArea = forwardRef(ExpandingTextAreaUnforwarded)
