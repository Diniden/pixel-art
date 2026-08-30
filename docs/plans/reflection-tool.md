I want to make a new tool: Reflection

- This will let us draw a line (same concept as the line tool where press and
  drag begins drawing a line and release places the line)
- This time the line will be drawn BETWEEN pixels.
- Wherever the line is drawn, it will stay there as an animated dotted line.
- To represent the pixels that are effected by this operation, imagine the line
  is the splitting middle of a rotated box. The box extends forever
  perpendicular to the line until all pixels are covered. These are the pixels
  that are affected by the operation.
- Drawing or editing on one side of the line draws the exact same thing on the
  other side.
- The reflection tool will remain in place and be valid even when switching
  layers.
- We should be able to draw as many reflection lines as we want.
- The tool should have a tool panel in the tool rail, it will track the
  reflection lines drawn and will allow the user to cancel those lines via an x
  icon in there.
- The tool should have some common reflect strategies that you can click to auto
  draw some lines for you.
