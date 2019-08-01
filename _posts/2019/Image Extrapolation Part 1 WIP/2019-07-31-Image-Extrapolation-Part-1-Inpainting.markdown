---
layout: "post"
date: "2019-07-30 04:00"
title: "Image Extrapolation: Part 1"
subtitle: "Painting out with inpainting"
---

_This post marks the actual beginning of the image extrapolation project described in_ [Image Extrapolation: Part 0](https://heyitsguay.github.io/2019/07/29/Image-Extrapolation-Part-0-Preview.html). 

In this post, I define image extrapolation, show how image inpainting can be repurposed for extrapolation, and write a simple extrapolater using [scikit image](https://scikit-image.org/)'s `inpaint_biharmonic`.

The algorithms I am exploring for inpainting can be slow, so while experimenting I will run things on smaller image patches. Today, I'll use:
<p align="center">
  <a href="/images/image_extrapolation_1/patch.jpg">
    <img src="/images/image_extrapolation_1/patch.jpg" />
  </a>
</p> 

The final best result from today's experimentation:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_rec0.jpg">
    <img src="/images/image_extrapolation_1/inpainting_rec0.jpg" />
  </a>
</p> 

Booooring. And even more boring if you extend any further outward:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_rec1.jpg">
    <img src="/images/image_extrapolation_1/inpainting_rec1.jpg" />
  </a>
</p> 

Nevertheless it's an important milestone from a coding standpoint - I now have tools to turn any inpainting algorithm into an extrapolation algorithm and produce more figures like the ones above. Read on for more details.

The image, utility functions, and jupyter notebook used to produce the figures in this post are available [here](https://heyitsguay.github.io/data/image-extrapolation-part1.zip).



## Definitions

### Image extrapolation

Image extrapolation is using an algorithm to invent new data at the boundaries of an image:
<p align="center">
  <a href="/images/image_extrapolation_1/extrapolation_definition.jpg">
    <img src="/images/image_extrapolation_1/extrapolation_definition.jpg" />
  </a>
</p> 

To be interesting, the algorithm needs to fill in that gray area with content that resembles nearby real image content in a meaningful way. To create such an algorithm, I'm looking to _image inpainting_:

### Image inpainting

As defined by Wikipedia, [image inpainting](https://en.wikipedia.org/wiki/Inpainting) is the process of reconstructing lost or deteriorated parts of images and videos. Inpainting can help restore scans of physical photos that have suffered physical damage, but for my purpose it can also be used on digital images where regions have been masked:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_definition.jpg">
    <img src="/images/image_extrapolation_1/inpainting_definition.jpg" />
  </a>
</p> 

A **mask** is a binary image used to indicate deleted portions of another image, where an inpainting algorithm should inpaint. For this example, the mask would be: 
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_mask.jpg">
    <img src="/images/image_extrapolation_1/inpainting_mask.jpg" />
  </a>
</p> 

Inpainting algorithms attempt to fill in missing content so that it matches neighboring regions in the image. A similar task to extrapolation, albeit with better context clues to make use of. 

## Inpainting for extrapolation

Let's look at how to turn inpainting algorithms into extrapolation algorithms.

### Standard inpainting

A normal, well-defined inpainting problem would seek to restore a masked area
somewhere in the middle of a picture, like in the previous example. No part of the masked region is on (or even near) the image boundary. That means inpainting algorithms have a lot of detail on all sides of the masked region to use during restoration.  If I use scikit-image's `inpaint_biharmonic` on that example, I get this:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_example.jpg">
    <img src="/images/image_extrapolation_1/inpainting_example.jpg" />
  </a>
</p>
<!-- <p align="center">
  <a href="/images/image_extrapolation_1/inpainting_example_zoomed.jpg">
    <img src="/images/image_extrapolation_1/inpainting_example_zoomed.jpg" />
  </a>
</p> -->

### Boundary inpainting

However, there is nothing stopping us from considering masks that touch a boundary:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_border_1.jpg">
    <img src="/images/image_extrapolation_1/inpainting_border_1.jpg" />
  </a>
</p> 
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_border_1_combined.jpg">
    <img src="/images/image_extrapolation_1/inpainting_border_1_combined.jpg" />
  </a>
</p> 

In which case, `inpaint_biharmonic` still gives us a result, but with less detail:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_example_1.jpg">
    <img src="/images/image_extrapolation_1/inpainting_example_1.jpg" />
  </a>
</p>
<!-- <p align="center">
  <a href="/images/image_extrapolation_1/inpainting_example_1_zoomed.jpg">
    <img src="/images/image_extrapolation_1/inpainting_example_1_zoomed.jpg" />
  </a>
</p> -->

### Extrapolating with inpainting

**Main idea**: Inpainting and extrapolation can both be defined in terms of restoring masked image regions. 

So far we just looked at masking an existing boundary region in an image, but we can also just create a new, bigger image, with the old image in the center and the borders masked. It will look just like the first picture in this post:
<p align="center">
  <a href="/images/image_extrapolation_1/extrapolation_definition.jpg">
    <img src="/images/image_extrapolation_1/extrapolation_definition.jpg" />
  </a>
</p>

In this case, we'll add a width-60 border to the 500x372 image, giving us a new 620x492 extrapolated image. 

#### Simple extrapolation

The simplest thing to do to fill in this masked region is inpaint it all at once - a single call to `inpaint_biharmonic` with a width-60 border mask.
<p align="center">
  <a href="/images/image_extrapolation_1/extrapolation_simple_full.jpg">
    <img src="/images/image_extrapolation_1/extrapolation_simple_full.jpg" />
  </a>
</p>

Image details propagate outward a little bit, but quickly fade to black.

#### Recursive extrapolation

 The `inpaint_biharmonic` method seems to do ok for a few pixels around the border, but no further. We can try to take advantage of this by turning our simple extrapolation into a recursive one: Instead of running the extrapolator once with a width-60 border, we can try running it 10 times, each time adding a width-6 border. The resulting image is the same size, but details are filled in only a little at a time:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_rec1.jpg">
    <img src="/images/image_extrapolation_1/inpainting_rec1.jpg" />
  </a>
</p> 

Colors don't fade into black so quickly, but it's also clear that not much interesting will happen with this extrapolation - whatever colors were on the image boundary are blurrily propagated outward. With a judicious crop it can be made to look a little better, giving us the final image of this post:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_rec0.jpg">
    <img src="/images/image_extrapolation_1/inpainting_rec0.jpg" />
  </a>
</p>

## Conclusion

In this post, we saw how to use inpainting for extrapolation, and demo'd an extrapolation using the easily-available but too-basic `inpaint_biharmonic` function. This inpainting approximately preserves the color palette and some broad structural details, but obviously a lot is missing. However, this first attempt was successful at establishing a workflow for extrapolation using any inpainting function. In future posts, I'll look at replacing this with an inpainting neural network, and I can build upon the workflow established here to allow easy swapout and comparison of different inpainting algorithms.

