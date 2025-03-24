import pygame
import numpy as np
from elkwork import MLP
import matplotlib.pyplot as plt


pygame.init()

screenWidth = 560
screenHeight = 560
gridSize = 20
rows = 28
cols = 28


screen = pygame.display.set_mode((screenWidth, screenHeight))
pygame.display.set_caption("Draw on Grid")


grid = np.zeros((rows, cols))


mlp = MLP([28*28, 925, 10], 'relu', 500, 'he', 100, 'cross')
mlp.load('Drawer_source/save.txt')

white = (255,255,255)
black = (0,0,0)

def drawGrid():
    for row in range(rows):
        for col in range(cols):
            x = col * gridSize
            y = row * gridSize
            color = black if grid[row, col] == 1 else white
            pygame.draw.rect(screen, color, pygame.Rect(x, y, gridSize, gridSize))
            pygame.draw.rect(screen, black, pygame.Rect(x, y, gridSize, gridSize), 1)



def applyBrush(x, y):
    x = x // gridSize
    y = y // gridSize
    if 0 <= x < rows - 1 and 0 <= y < cols - 1:
        grid[y][x] = 1
        grid[y][x + 1] = 1
        grid[y + 1][x] = 1
        grid[y + 1][x + 1] = 1


def showImg(flatImage):
    image = flatImage.reshape(28, 28)
    plt.imshow(image, cmap='gray')
    plt.show()


drawing = False
clock = pygame.time.Clock()

while True:
    screen.fill(white)
    drawGrid()

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            quit()

        if event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:
                drawing = True

        if event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1:
                drawing = False
                flattenedImage = grid.flatten()
                showImg(flattenedImage)
                prediction = mlp.predict(flattenedImage)
                print(prediction)
                grid = np.zeros((rows, cols))

        if event.type == pygame.MOUSEMOTION:
            if drawing:
                mouseX, mouseY = event.pos
                applyBrush(mouseX, mouseY)

    pygame.display.update()
    clock.tick(100)  
