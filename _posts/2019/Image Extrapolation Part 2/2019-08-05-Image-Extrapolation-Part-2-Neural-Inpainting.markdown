---
layout: "post"
date: "2019-08-05 14:20"
title: "Image Extrapolation: Part 2.1"
subtitle: "Literature review summary and paper 1 demo"
---

To figure out where to begin, I need to do a literature search on the neural architectures people are using right now for image extrapolation and inpainting. Instead of Google Scholar, for this project I will search [Papers With Code](paperswithcode.com), since papers with reproducible examples are much easier to adapt to new data. I'll start by putting together an overview of what I found for image extrapolation and inpainting.

#### Image extrapolation

[Wide-context semantic image extrapolation](https://paperswithcode.com/paper/wide-context-semantic-image-extrapolation)

[Painting Outside the Box: Image Outpainting with GANs](https://paperswithcode.com/paper/painting-outside-the-box-image-outpainting)

#### Image inpainting

[EdgeConnect: Generative Image Inpainting with Adversarial Edge Learning](https://paperswithcode.com/paper/edgeconnect-generative-image-inpainting-with)

[Semantic Image Inpainting with Deep Generative Models](https://paperswithcode.com/paper/semantic-image-inpainting-with-deep)

[Free-Form Image Inpainting with Gated Convolution](https://paperswithcode.com/paper/free-form-image-inpainting-with-gated)

[Generative Image Inpainting with Contextual Attention](https://paperswithcode.com/paper/generative-image-inpainting-with-contextual)

## Diving in

My search turned up several examples with interesting architectures and claims of photorealistic results. I want to explore at least a few of them by getting the repos up and running on available examples using pre-trained networks. Anything promising can be fine-tuned or retrained on a new data corpus with my Balåliden picture in mind.

###  Wide-context semantic image extrapolation

I can't introduce (Wang et al., 2019) better than the authors themselves, so the following paragraph and images are quoted from author Yi Wang's excellent [GitHub repository](https://github.com/shepnerd/outpainting_srn):

> This repository gives the Tensorflow implementation of the method in CVPR 2019 paper, 'Wide-Context Semantic Image Extrapolation'. This method can expand semantically sensitive objects (face, body) / scenes beyond image boundary.

<p align="center">
  <a href="/images/image_extrapolation_2/paper1-intro.jpg">
    <img src="/images/image_extrapolation_2/paper1-intro.jpg" />
  </a>
</p> 

The results for scenes are particularly relevant and show some potential for applicability. Original image boundaries are pronounced in places, and some of the extrapolated natural landscape regions are monotonous, but these are problems that might be solved with the right training corpus:

<p align="center">
  <a href="/images/image_extrapolation_2/paper1-scenes1.jpg">
    <img src="/images/image_extrapolation_2/paper1-scenes1.jpg" />
  </a>
</p> 

<p align="center">
  <a href="/images/image_extrapolation_2/paper1-scenes2.jpg">
    <img src="/images/image_extrapolation_2/paper1-scenes2.jpg" />
  </a>
</p> 

<p align="center">
  <a href="/images/image_extrapolation_2/paper1-scenes3.jpg">
    <img src="/images/image_extrapolation_2/paper1-scenes3.jpg" />
  </a>
</p> 

#### Architecture

(Wang 2019)'s' method uses a convolutional neural network architecture with two modules: A 'feature expansion' network for extracting deep features from a smaller input image, and a context prediction network to infer a larger output image from the input and its features. 

<p align="center">
  <a href="/images/image_extrapolation_2/paper1-net.jpg">
    <img src="/images/image_extrapolation_2/paper1-net.jpg" />
  </a>
</p> 

The paper's innovations in network layers (feature expansion, context normalization) and loss functions deserve their own deeper dive-in, but right now I am interested in results!

#### Getting it running

Cloning the repo and downloading a [pretrained network for the CelebA-HQ_256 dataset](https://drive.google.com/drive/folders/1q8LhVV6oFaqhWABf10lHzkPONJVO7tWr?usp=sharing) is easy enough. The test code produces some plausible output for some faces:

<p align="center">
  <a href="/images/image_extrapolation_2/paper1-demo1.png">
    <img src="/images/image_extrapolation_2/paper1-demo1.png" />
  </a>
</p> 

... And that is where I will leave this post for tonight!

## Next time

Training the (Wang 2019) network, creating a trainable dataset from the Balåliden images, and maybe using some subset of the MIT [Places dataset](http://places2.csail.mit.edu/) to expand the image corpus.
