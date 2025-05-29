<<<<<<< HEAD
import pygame
import numpy as np
from MLP import MLP
import matplotlib.pyplot as plt
import math

"""
Multilayer perceptron test with new experimental centering program.
Gives good accuracies with human entered digits, even when they are off centre.
Struggles with scaling digits.
"""

#Some important variables initialized

pygame.init()
screenWidth = 840 
screenHeight = 840
gridSize = 30
rows = 28
cols = 28
displayHeight = 150


screen = pygame.display.set_mode((screenWidth, screenHeight + displayHeight),pygame.RESIZABLE)
pygame.display.set_caption("Live elkwork demo")




grid = np.zeros((rows, cols))


mlp = MLP([28*28, 925, 10], 'relu', 500, 'he', 100, 'cross')
# model used for this demonstration achieves 98.51% accuracy on the MNIST dataset. The loss evaluation function for this was cross entropy.
mlp.load("Drawer_source/save.txt")

white = (255,255,255)
black = (0,0,0)


def drawGrid() -> None:
    #initializes the grid

    for row in range(rows):
        for col in range(cols):
            x = col * gridSize + (screenWidth - gridSize * 28) / 2
            y = row * gridSize + displayHeight + (screenHeight - displayHeight - gridSize * 28) / 2
            color = black if grid[row, col] == 1 else white
            pygame.draw.rect(screen, color, pygame.Rect(x, y, gridSize, gridSize))
            pygame.draw.rect(screen, black, pygame.Rect(x, y, gridSize, gridSize), 1)
            pygame.draw.rect(screen,(200,200,200), pygame.Rect(0,0,screenWidth,displayHeight))

def draw(text,font,color,x,y) -> None:

    #Draws text 

    img = font.render(text, True, color)
    screen.blit(img,(x,y))

def applyBrush(x, y) -> bool:
    x = round((x - (screenWidth - gridSize * 28) / 2) / 28)
    y = (y - (screenHeight - displayHeight - gridSize * 28) / 2) / 28

    init = False


    #Shades in grid depending where mouse curson is

    if math.floor(x) < int(x) + 0.5:
        x = int(x)
        y = int(y)
        if 0 <= x < rows and 0 <= y < cols:
            if grid[y][x] != 1 or grid[y][x - 1] != 1 or grid[y - 1][x] != 1 or grid[y - 1][x - 1] != 1:
                init = True
            grid[y][x] = 1
            if x > 0:
                grid[y][x - 1] = 1
            
            if y > 0:
                grid[y - 1][x] = 1

            if x > 0 and y > 0:
                grid[y - 1][x - 1] = 1
    else:
        x = int(x)
        y = int(y)
        if 0 <= x < rows - 1 and 0 <= y < cols - 1:
            if grid[y][x] != 1 or grid[y][x + 1] != 1 or grid[y + 1][x] != 1 or grid[y + 1][x + 1] != 1:
                init = True
            grid[y][x] = 1
            grid[y][x + 1] = 1
            grid[y + 1][x] = 1
            grid[y + 1][x + 1] = 1
        

    return init

"""
  ___
 /  /|
---- |
|  | |
----/

"""


def showImg(flatImage) -> None:
    #displays the image through matplotlib. Used for debugging

    image = flatImage.reshape(28, 28)
    plt.imshow(image, cmap='gray')
    plt.show()

def centralise(grid) -> list:

    #centres the image. Helps a lot with the neural network specified because it is not trained on off-centre images

    rows = np.any(grid, axis=1)  
    cols = np.any(grid, axis=0)  

    if not rows.any() or not cols.any():
        return grid  

    yMin, yMax = np.where(rows)[0][[0, -1]]
    xMin, xMax = np.where(cols)[0][[0, -1]]

    cropped = grid[yMin:yMax+1, xMin:xMax+1]
    
    yOffset = (28 - cropped.shape[0]) // 2
    xOffset = (28 - cropped.shape[1]) // 2

    centeredGrid = np.zeros((28, 28))
    centeredGrid[yOffset:yOffset+cropped.shape[0], xOffset:xOffset+cropped.shape[1]] = cropped

    return centeredGrid

    
def displayProbabilities(prediction) -> None:
    # A function that displays everything through pygame GUI

    if len(prediction) > 0:
        
        font = pygame.font.SysFont("Arial", int(30 * screenHeight/750))
        smallfont = pygame.font.SysFont("Arial", int(30 * screenHeight/2000))


        spacing = screenWidth / 11

        for number, probability in enumerate(prediction[0]):
            draw(str(number),font,"black",spacing * (number + 1) + ((screenWidth / 20) / 4) - 10,10)
                #pygame.draw.circle(screen, 'red', (spacing * (number + 1),70), probability)

            if number != np.argmax(prediction[0]):
                pygame.draw.rect(screen,'red',pygame.Rect((spacing * (number + 1)) - 20, screenHeight * 6/100, screenWidth / 20, probability * 2 * screenHeight / 840))
            else:
                pygame.draw.rect(screen,'green',pygame.Rect((spacing * (number + 1)) - 20, screenHeight * 6/100, screenWidth / 20, probability * 2 * screenHeight / 840))

            draw(f"{round(probability,2)}%",smallfont,"black",spacing * (number + 1) + (screenWidth / 40) - 7 * len(f"{round(probability,2)}%"), screenHeight * 6.1/100)

        draw(f"Final prediction of the number drawn: {np.argmax(prediction)}", font, 'black', screenWidth/2 - 250, screenHeight / 8.4)

def displayPlaceholder() -> None:
    # The function responsible for the screen that shows up when nothing is drawn
    font = pygame.font.SysFont("Arial", int(30 * screenHeight/750))

    draw("Please draw a digit on the canvas below", font, 'black', screenWidth/2 - 260, screenHeight / 15)

drawing = False
updated = False
clock = pygame.time.Clock()
init = False
empty = True
prediction = []
ended = False

while True:
    screen.fill(white)
    drawGrid()
    if drawing:
        empty = False
    
    if empty:
        displayPlaceholder()
    else:
        if init:
            flattenedImage = centralise(grid).flatten()
            prediction = mlp.predict(flattenedImage,True)
        displayProbabilities(prediction)
    
    init = False
    
    screenWidth,screenHeight = pygame.display.get_window_size()
    displayHeight = int(150/840 * screenHeight)
    gridSize = min([(screenHeight - displayHeight) // 28, screenWidth // 28])


    #Event handler that handles key presses. The x key closes the program
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            quit()

        if event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:
                drawing = True
                if ended == True:
                    grid = np.zeros((rows, cols))
                    empty = True

        if event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1:
                drawing = False
                ended = True

        if event.type == pygame.MOUSEMOTION:
            if drawing:
                mouseX, mouseY = event.pos
                init = applyBrush(mouseX, mouseY - displayHeight)
        
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_x:
                quit()
                
        

    pygame.display.update()
    clock.tick(200)  
=======
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
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
