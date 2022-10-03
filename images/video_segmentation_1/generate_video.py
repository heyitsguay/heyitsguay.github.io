import os

import matplotlib.pyplot as plt
import numpy as np

os.makedirs('beans_frames')

x0 = plt.imread('beans.jpg')[:-1, :-1, :]
x1 = plt.imread('beans2.jpg')[:-1, :-1, :]

ts = np.linspace(0, 1, 60)
for i, t in enumerate(ts):
	savefile = os.path.join('beans_frames', f'{i:03}.jpg')
	plt.imsave(savefile, (t * x1 + (1 - t) * x0).astype(x0.dtype))
