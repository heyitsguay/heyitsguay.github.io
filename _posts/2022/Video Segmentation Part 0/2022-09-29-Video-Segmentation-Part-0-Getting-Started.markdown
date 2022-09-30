---
layout: "post"
date: "2022-09-29 15:44"
title: "Video Segmentation: Part 0"
subtitle: "Getting Started"
---

The past decade has been witness to an explosion in research and development for computer vision. From [Alexnet]()'s modest roots, leveraging gaming GPUs to bump convnet performance on the [ImageNet]() challenge, neural net-based computer vision methods now underly powerful economic engines, and a huge research community has released a host of open source tools for solving computer vision problems for fun, art, and profit. The ability to algorithmically understand image content offers new capabilities for interactive algorithmic experiences, and as megacorp labs pour billions of dollars into ever-growing datasets and compute power, onlookers breathlessly speculate about an incoming technological singularity powered by Artificial General Intelligence.

In the face of this power and progress, one might then reasonably ask -- cool, but how do I *do* anything with computer vision?

## From 0 to 1

By "do", I mean, how can we take the methods and tools available in the broader machine learning (ML) community, and deploy them to solve a problem in the real-world? Beyond beating benchmarks and operating black-box turnkey solutions like [AWS Rekognition]() when our needs happen to overlap with their narrow domains, how can we create computer vision solutions of our own? Solutions that work for whatever unique data and environments we might have, for tasks beyond face recognition or autonomous vehicle street understanding, or detecting Pepsi logos on a TV screen.

This blog series will provide a step-by-step guide to answering this question in its entirety, starting from scratch and ending with an app running on Arduino hardware. The focus will be on how to practically use computer vision to create a real-time Arduino video segmentation app. To keep the project tangible, I will explore creating a segmentation app for my two new kitties, Peach and Daisy: 

<p align="center">
  <a href="/images/video_segmentation_0/beans.jpg">
    <img src="/images/video_segmentation_0/beans.jpg" />
  </a>
</p>

## Project Setup

This post will cover initial setup of the hardware I will be using throughout the series, as well as the [OpenMV IDE]() for working on embedded machine vision applications.

#### Arduino

This project uses the Arduino [Portenta H7]() along with the [Vision Shield]() camera and computer vision module, which I purchased together as the Arduino [Machine Vision Bundle]().