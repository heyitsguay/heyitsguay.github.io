---
layout: "post"
date: "2022-09-29 15:44"
title: "Video Segmentation: Part 0"
subtitle: "Getting Started"
---

The past decade has been witness to an explosion in research and development for computer vision. From [Alexnet](https://en.wikipedia.org/wiki/AlexNet)'s modest roots, leveraging gaming GPUs to bump convnet performance on the [ImageNet](https://en.wikipedia.org/wiki/ImageNet) challenge, neural net-based computer vision methods now underly powerful economic engines, and a huge research community has released a host of open source tools for solving computer vision problems for fun, art, and profit. The ability to algorithmically understand image content offers new capabilities for interactive algorithmic experiences, and as megacorp labs pour billions of dollars into ever-growing concentrations of data and compute, onlookers breathlessly foretell a technological singularity powered by Artificial General Intelligence.

In the face of such power and progress, one might then reasonably ask -- cool, but can I actually *use* computer vision for anythhing?

## From 0 to 1

By "use", I mean, how can we take the methods and tools available in the broader machine learning (ML) community, and deploy them on our own hardware to solve a problem in the real world? Beyond gated, nonfree cloud offerings focused on narrow domains, how do we create practical solutions that we own and control? Solutions that work for whatever unique data and environments we might have, for tasks beyond face recognition, or autonomous vehicle street understanding, or detecting Pepsi logos on a TV screen.

This blog series will provide a step-by-step guide to answering this question in its entirety, starting from scratch and ending with an app running on Arduino hardware. The focus will be on how to practically use computer vision to create a real-time Arduino video segmentation app. To keep the project tangible, I will explore creating a segmentation app to detect my two new kitties, Peach and Daisy: 

<p align="center">
  <a href="/images/video_segmentation_0/beans.jpg">
    <img src="/images/video_segmentation_0/beans.jpg" />
  </a>
</p>

## Project Setup

This page will cover initial setup of the hardware I will be using throughout the series, as well as the [OpenMV IDE](https://openmv.io/pages/download) for working on embedded machine vision applications.

#### Hardware

This project uses the Arduino [Portenta H7]() along with the [Vision Shield](https://store-usa.arduino.cc/products/arduino-portenta-vision-shield-ethernet) camera and computer vision module, which I purchased together as the Arduino [Machine Vision Bundle](https://store-usa.arduino.cc/products/machine-vision-bundle). The Vision Shield has a low-power 324x324 grayscale camera that's well-suited for the limitations we will face trying to do embedded ML.

I make no claims to whether or not this will work with other Arduino hardware, but the OpenMV IDE claims compatibility with a broad host of camera modules, and this project may transfer in whole or part to other OpenMV-compatible hardware.

#### Development Environment

For this project, I will be working between my desktop computer running 64-bit Ubuntu 18.04 and a laptop running 64-bit Ubuntu 20.04. Hardware and OpenMV setup was the same on both, but only my desktop has a GPU (NVIDIA GTX 1080) that will get used in later stages of this project. For this post, it's irrelevant.

My initial testing of the hardware followed the [official guide](https://docs.arduino.cc/tutorials/portenta-h7/setting-up-portenta). In particular, this section at the end was crucial for both of my computers:

<p align="center">
  <a href="/images/video_segmentation_0/linux.jpg">
    <img src="/images/video_segmentation_0/linux.jpg" />
  </a>
</p>

As suggested in the official guide, I first tried running basic scripts using [Arduino IDE 2.0](https://www.arduino.cc/en/software). I was able to get the "hello world" blinking LED script to work, but nothing involving the camera. In my search for a solution, I learned about the OpenMV IDE as a micropython-based alternative to the Arduino IDE. With OpenMV, everything basically Just Worked, so this page will focus on that.

#### OpenMV

