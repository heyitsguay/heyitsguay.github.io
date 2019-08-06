#!/usr/bin/python3.6

import random
import os
import sys

import matplotlib.pyplot as plt
import numpy as np

import glob


def make_patches(save_dir: str,
                 patch_size: int,
                 patch_overlap: int):   
    os.makedirs(save_dir, exist_ok=True)

    jpgs = glob.glob('*.jpg')

    idx = 0
    n_patches = count_patches(jpgs, patch_size, patch_overlap)
    idx_scrambled = list(range(n_patches))
    random.shuffle(idx_scrambled)

    for jpg in jpgs:
        img = plt.imread(jpg)
        ximg, yimg = img.shape[:2]

        xfinal = ximg - patch_size
        yfinal = yimg - patch_size
        patch_delta = patch_size - patch_overlap

        xs = list(range(0, xfinal, patch_delta))
        if xs[-1] != xfinal:
            xs.append(xfinal)
        ys = list(range(0, yfinal, patch_delta))
        if ys[-1] != yfinal:
            ys.append(yfinal)

        for x in xs:
            for y in ys:
                i = idx_scrambled[idx]
                idx += 1
                patch = img[x:(x+patch_size), y:(y+patch_size), :]
                plt.imsave(
                    os.path.join(f'{save_dir}', f'{i:04d}.jpg'), 
                    patch)

    pass


def count_patches(jpgs: str, 
                  patch_size: int, 
                  patch_overlap: int) -> int:
    
    n_patches = 0
    for jpg in jpgs:
        img = plt.imread(jpg)
        ximg, yimg = img.shape[:2]

        xfinal = ximg - patch_size
        yfinal = yimg - patch_size
        patch_delta = patch_size - patch_overlap

        xs = list(range(0, xfinal, patch_delta))
        if xs[-1] != xfinal:
            xs.append(xfinal)
        ys = list(range(0, yfinal, patch_delta))
        if ys[-1] != yfinal:
            ys.append(yfinal)

        n_patches += len(xs) * len(ys)

    return n_patches


if __name__ == '__main__':
    argv = sys.argv
    
    patch_size = 256
    patch_overlap = 128

    save_dir = argv[1]

    if len(argv) > 2:
        patch_size = argv[2]
    if len(argv) > 3:
        patch_overlap = argv[3]

    make_patches(save_dir, patch_size, patch_overlap)
