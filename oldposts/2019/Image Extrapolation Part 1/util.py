import os

import matplotlib.pyplot as plt
import numpy as np

from scipy import signal


from typing import Sequence


def tovideo(name='out.mp4', src='.', framerate=15, reverse=True):
    pngs =  sorted([f for f in os.listdir(src) if '.png' in f])
    n = len(pngs)
    if reverse:
        lf = int(pngs[-1].split('.')[0])
        for i in range(1, n-1):
            fin = os.path.join(src, f'{lf-i:05}.png')
            fout = os.path.join(src, f'b{lf+i:05}.png')
            os.system(f'cp {fin} {fout}')
    src_glob = os.path.join(src, '*.png')
    dst_glob = os.path.join(src, 'b0*.png')
    os.system(f'ffmpeg -framerate {framerate} -pattern_type glob -i "{src_glob}" -vcodec libx264 -crf 0 -preset ultrafast {name} -y')
    if reverse:
        os.system(f'rm {dst_glob}')
    pass

    
def imshow(x, figsize, *args, frame=True, **kwargs):
    f, ax = plt.subplots(1, figsize=figsize)
    f.subplots_adjust(left=0, right=1, bottom=0, top=1)
    ax.imshow(x, *args, extent=(0, 1, 1, 0), **kwargs)
    ax.axis('tight')
    if frame:
        ax.get_xaxis().set_ticks([])
        ax.get_yaxis().set_ticks([])
    else:
        ax.axis('off')
    pass


def imsave(arr, name=None, **kwargs):
    # All images are saved within media/
    folder = 'media'
    if name is None:
        # If no name is supplied find the last-created PNG in media/,
        # interpret its name as a number, and add 1
        pngs = sorted([d for d in os.listdir(folder)
                      if os.path.splitext(d)[1] == '.png'],
                      key=lambda d: os.path.getmtime(
                        os.path.join(folder, d)))
        n_last_png = int(pngs[-1].split('.')[0]) if pngs else -1
        name = f'{(n_last_png+1):05}'
    filename = os.path.join('media', name)
    if filename[-4:] != '.png':
        filename += '.png'
    if os.path.dirname(filename):
       os.makedirs(os.path.dirname(filename), exist_ok=True)
    plt.imsave(filename, arr, **kwargs)
    command = f'convert {filename}' \
              f' -define png:compression-filter=2' \
              f' -define png:compression-level=6' \
              f' -define png:compression-strategy=1' \
              f' {filename}'
    os.system(command)
    pass
    
    
def figsave(name=None, dpi=300):
    # All images are saved within media/
    folder = 'media'
    if name is None:
        # If no name is supplied find the last-created PNG in media/,
        # interpret its name as a number, and add 1
        pngs = sorted([d for d in os.listdir(folder)
                      if os.path.splitext(d)[1] == '.png'],
                      key=lambda d: os.path.getmtime(
                        os.path.join(folder, d)))
        n_last_png = int(pngs[-1].split('.')[0])
        name = f'{(n_last_png+1):05}'
    filename = os.path.join('media', name)
    if filename[-4:] != '.png':
        filename += '.png'
    if os.path.dirname(filename):# and not os.path.exists(os.path.dirname(filename)):
        os.makedirs(os.path.dirname(filename), exist_ok=True)
    plt.savefig(filename, dpi=dpi, transparent=True)
    command = f'convert {filename}' \
              f' -define png:compression-filter=2' \
              f' -define png:compression-level=6' \
              f' -define png:compression-strategy=1' \
              f' {filename}'
    os.system(command)
    pass


def normalize(x):
    return (x - x.min()) / (x.max() - x.min())


def gkern(kernlen=21, std=3):
    """Returns a 2D Gaussian kernel array."""
    gkern1d = signal.gaussian(kernlen, std=std).reshape(kernlen, 1)
    gkern2d = np.outer(gkern1d, gkern1d)
    gkern2d = (gkern2d / gkern2d.sum())
    return gkern2d
   

def blur(x, t=1, w=21, std=3, damping=None):
    if not isinstance(std, Sequence):
        k = gkern(kernlen=w, std=std)
        if x.ndim == 3:
            k = np.expand_dims(k, -1)
    if damping is None:
        damping = t
    out = np.copy(x)
    i_std = 0
    while t > 0:
        if isinstance(std, Sequence):
            s = std[i_std]
            k = gkern(kernlen=w, std=s)
            i_std += 1
            if x.ndim == 3:
                k = np.expand_dims(k, -1)
        out = signal.fftconvolve(out, k, mode='same')
        if t > damping:
            out[x == 1] = 1
        t -= 1
    return out


def sigmoid(x, c=10):
    return 1 / (1 + np.exp(-c*(x-0.5)))


def adjust_linear(img, x0, y0):
    out = np.copy(img)
    region = out < x0
    out[region] = ((1 - y0 / x0) * out + y0)[region]
    return out


def adjust_root(img, x0, y0, n=3):
    out = np.copy(img)
    region = out < x0
    out[region] = ((img / x0)**(1/n) * (x0 - y0) + y0)[region]
    return out


def adjust_sigmoid(img, x0, y0, slope):
    c1 = 1 + np.exp(slope / 2)
    c2 = 1 + np.exp(-slope / 2)
    a = 1 / (1 / c2 - 1 / c1)
    b = a / c1
    sig = lambda x: a / (1 + np.exp(-slope * (x - 0.5))) - b
    
    out = np.copy(img)
    region = out < x0
    region = out < x0
    out[region] = (sig(img / x0) * (x0 - y0) + y0)[region]
    return out   


def quantize(x, n):
    # Quantize a value x in the range [0, 1] into n bins
    n = np.floor(n)
    return np.floor(x * n) / n