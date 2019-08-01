---
layout: "post"
date: "2019-07-30 04:00"
title: "Image Extrapolation: Part 1"
subtitle: "Painting out with inpainting"
---

This post marks the actual beginning of the image extrapolation project. I define image extrapolation, show how image inpainting can be repurposed for extrapolation, and write a simple extrapolater using [scikit image](https://scikit-image.org/)'s `skimage.restoration.inpaint.inpaint_biharmonic`.

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

**Image extrapolation** is using an algorithm to fill in new image data at the boundaries of an image:

<p align="center">
  <a href="/images/image_extrapolation_1/extrapolation_definition.jpg">
    <img src="/images/image_extrapolation_1/extrapolation_definition.jpg" />
  </a>
</p> 
To be interesting, the algorithm needs to fill in that gray area with structures that resemble nearby image contents in a meaningful way.


## Image inpainting


<!-- <p align="center">
  <a href="/images/image_extrapolation_0/r10d90.jpg">
    <img src="/images/image_extrapolation_0/r10d90.jpg" />
  </a>
</p>  -->