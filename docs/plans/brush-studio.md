Lets implement a very complex feature: Brushes

- We will start by creating the "Brush Studio" which will be activated via a
  button in the tool bar next to the lighting studio button
- Brush studio's goal is to generate brushes that will be available in the pixel
  editor (we will ignore that part of the implmentation for now and will focus
  on building brushes)
- A brush will be defined as pixel data that applies changes to the pixel studio
- A brush can have layers and frames. How they will be applied will be complex.

The Big stuff:

- This mode will hijack the layers siderail: it will replace the object selector
  with a brush selector.
- The layers will now be layers representing brush data. There will be NO
  CONCEPT of VARIANTS within brush editing.
- Layers will be more complex in that layers will be able to be grouped into
  APPLIED LAYERS. Applied layers are how pixel layer data for the brush will be
  applied and divided into the target layers of the pixel studio (more on this
  UX when we actually start implementing using the brushes in pixel studio)
- Layer's will also have the ability to declare their pixel data type. There
  will be a button that opens a menu to select HSL, RGB, NORMAL, or HEIGHTMAP.
- All tools should be allowed to be used on brush layers, but the color
  selections are instead the channels selected by the layer and range -255 to
  255; the pixel data represents the DELTA for that channel when the brush is
  used. When drawing to a layer each channel HSLA or RGBA will map to RGBA for
  rendering. The color will be mapped to the closest value with 127 as 0 and 0
  as -255 and 255 as 255. The rendering will be colorized this way, BUT the
  values will be stored as the higher resolution of -255 to 255. So an H delta
  of 100 will render as R with an appropriate value of 127 to 255. And an S of
  -100 will render as a G with an appropriate value of 0 to 127.
- Brushes will also have frames. So the frame controller will still need to be
  available BUT AGAIN, no variants. The timeline view will also be needed;
  HOWEVER, per frame ordering of layers will not be possible. We will instead
  only allow layer swapping. Brush frames will be used for various effects in
  the pixel studio to be implemented later. We will need play mode for feedback,
  but we do NOT need optimized playback mode.
- Brushes need to be saved in their own project files. This will let us save
  them and use them across projects, so the brush studio needs to hijack the
  project Button in the toolbar and replace it with "Brushes" as the the label.
