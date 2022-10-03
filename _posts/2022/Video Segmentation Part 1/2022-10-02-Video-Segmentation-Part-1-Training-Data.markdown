---
layout: "post"
date: "2022-10-02 16:53"
title: "Video Segmentation: Part 1"
subtitle: "Training Data"
---

This is the second post in a series on deploying a video segmentation app for the Arduino [Portenta H7](https://store-usa.arduino.cc/products/portenta-h7) and [Vision Shield](https://store-usa.arduino.cc/products/arduino-portenta-vision-shield-ethernet). You can read the [first post](https://heyitsguay.github.io/2022/09/29/Video-Segmentation-Part-0-Getting-Started.html) for more information on project motivation, as well as the details for setting up our hardware and software development environments.

## Overview

The overall project goal is to create a segmentation app, running on the Portenta H7 + Vision Shield, to detect my new kitties Daisy and Peach!

<p align="center">
    <video width="100%" autoplay muted loop>
      <source src="/images/video_segmentation_1/beanloop.mp4" type="video/mp4" />
      Your browser does not support the video tag.
    </video>
</p>

The [previous post](https://heyitsguay.github.io/2022/09/29/Video-Segmentation-Part-0-Getting-Started.html) detailed setting up our Arduino hardware with the [OpenMV IDE](https://openmv.io/pages/download) to access and record the Vision Shield camera feed, like so:

<p align="center">
    <video width="50%" autoplay muted loop>
      <source src="/images/video_segmentation_0/recording.mp4" type="video/mp4" />
      Your browser does not support the video tag.
    </video>
</p>

In this post, I will 
  1. Use that setup to record some video of the cats and their surroundings in my apartment.
  2. Talk more about image/video segmentation tasks -- definitions, objectives, and methods.
  3. Load clips extracted from my recorded video into [MiVOS](https://paperswithcode.com/method/mivos) to generate training data for a segmentation neural network.

By the end of this post, we will be ready to start training a segmentation neural network on our Vision Shield camera's video data. In the next post, we will run through the details of training a segmentation neural network on consumer desktop NVIDIA GPU hardware, leading to a final post where the large desktop segmentation model is transferred to an embedded model capable of running on the Arduino.