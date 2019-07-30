---
layout: "post"
date: "2019-07-29 04:00"
title: "Image Extrapolation: Part 0"
subtitle: "A preview of things to come"
---

## Hello world!

I'm starting a for-fun visual project to explore image extrapolation using neural networks. A lot more on that in a future update! For the first time, I am trying to document a creative project in writing as I go, on my GitHub Page. My hope is that this will help clarify my thinking about the steps required to make this happen, and generate interesting content in the process. 

## The plan

### Pick a picture

Find an interesting image in some image corpus. Right now I am thinking of some of the outdoor photos Eli and I took around Balåliden, Sweden. 17 photos, about 43 million pixels' worth of data to learn from.

<p align="center">
  <a href="/images/image_extrapolation_0/collage1.jpg">
    <img src="/images/image_extrapolation_0/collage1.jpg" />
  </a>
</p>

Northern Sweden is a magical place just after Midsommar, and I would be curious to see what a network might dream up from any of the pictures Eli and I took up there, but I am most curious about one we got in Angnäs:

<p align="center">
  <a href="/images/image_extrapolation_0/original.jpg">
    <img src="/images/image_extrapolation_0/original.jpg" />
  </a>
</p>

### Train an extrapolation network

Train a neural net on an **image extrapolation** task using the Balåliden corpus. Doing this right will be the bulk of the work of this project. There are many questions left to answer. I will likely need to pretrain on an additional corpus of natural images.

### Extrapolate away

Take an image and apply the extrapolation algorithm to its borders repeatedly, until the predictions become abstract, non-physical, glitchy? With a little luck, elbow grease, and data science, the result might look pretty cool!

## Tonight's contribution

Has nothing to do with the meat of the actual project. Instead, I will end this post with a quick observation from loading the Angnäs photo into GIMP. My phone's camera produces images with edges that can look a little over-sharp at full resolution:

<p align="center">
  <a href="/images/image_extrapolation_0/base.jpg">
    <img src="/images/image_extrapolation_0/base.jpg" />
  </a>
</p>

A small amount of blurring fixes it up, but I also inadvertently discovered that a little extra selective Gaussian blurring produces a dreamy watercolor result, a slightly-surreal vibe that meshes perfectly with the beautiful, endless midsummer days in Sweden's northern countryside.

<p align="center">
  <a href="/images/image_extrapolation_0/r10d90.jpg">
    <img src="/images/image_extrapolation_0/r10d90.jpg" />
  </a>
</p> 