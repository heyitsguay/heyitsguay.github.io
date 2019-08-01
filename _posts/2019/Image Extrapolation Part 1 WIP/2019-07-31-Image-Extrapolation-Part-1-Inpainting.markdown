---
layout: "post"
date: "2019-07-30 04:00"
title: "Image Extrapolation: Part 1"
subtitle: "Painting out with inpainting"
---

This post marks the actual beginning of the image extrapolation project described in [Image Extrapolation: Part 0](https://heyitsguay.github.io/2019/07/29/Image-Extrapolation-Part-0-Preview.html). 

Here, I define image extrapolation, show how image inpainting can be repurposed for extrapolation, and write a simple extrapolater using [scikit image](https://scikit-image.org/)'s `inpaint_biharmonic`.

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

Nevertheless it's an important milestone from a coding standpoint - I now have tools to turn any inpainting algorithm into an extrapolation algorithm and get more figures like the ones above. Read on for more details:



## Definitions

### Image extrapolation

Image extrapolation is using an algorithm to invent new data at the boundaries of an image:
<p align="center">
  <a href="/images/image_extrapolation_1/extrapolation_definition.jpg">
    <img src="/images/image_extrapolation_1/extrapolation_definition.jpg" />
  </a>
</p> 

To be interesting, the algorithm needs to fill in that gray area with content that resembles nearby real image content in a meaningful way. To create such an algorithm, I'm looking to a similar problem, _image inpainting_:

### Image inpainting

As defined by Wikipedia, [image inpainting](https://en.wikipedia.org/wiki/Inpainting) is the process of reconstructing lost or deteriorated parts of images and videos. Inpainting can help restore scans of physical photos that have suffered physical damage, but for my purpose it can also be used on digital images where regions have been _masked_:
<p align="center">
  <a href="/images/image_extrapolation_1/inpainting_definition.jpg">
    <img src="/images/image_extrapolation_1/inpainting_definition.jpg" />
  </a>
</p> 

Inpainting algorithms attempt to fill in missing content so that it matches neighboring regions in the image. 


For my purpose, inpainting algorithms attempt to replace missing information in portions of an image obscured by a mask. What follows is a basic example, adapted from the [scikit-image inpainting example](https://scikit-image.org/docs/dev/auto_examples/filters/plot_inpaint.html):



<!-- <p align="center">
  <a href="/images/image_extrapolation_0/r10d90.jpg">
    <img src="/images/image_extrapolation_0/r10d90.jpg" />
  </a>
</p>  -->