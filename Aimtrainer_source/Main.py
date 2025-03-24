import pygame
import random
import time

class target:
    def __init__(self,screenWidth,screenHeight,size,splitter):
        self.size = size
        self.x = random.randint(self.size * 2,screenWidth - self.size * 2)
        self.y = random.randint(self.size * 2 + splitter,screenHeight - self.size * 2)
    def update(self):
        pygame.draw.circle(screen,'red',(self.x,self.y),self.size)
    def checkClick(self):
        mousepos = pygame.mouse.get_pos()
        if (self.x - mousepos[0]) ** 2 + (self.y - mousepos[1]) ** 2 < self.size ** 2:
            return True
        return False



def draw(text,font,color,x,y):
    img = font.render(text, True, color)
    screen.blit(img,(x,y))


pygame.init()

running = True
FPS = 120
targetClicked = False
size = 20
hits = 0
hitstotal = 0
currenttime = 0
splitter = 150
textcolor = 'red'
trialtime = 0
firsttrialended = False
displayed_score = 0

screen = pygame.display.set_mode((0,0),pygame.FULLSCREEN)
screenWidth, screenHeight = screen.get_size()
currentTarget = target(screenWidth,screenHeight,size,splitter)

font = pygame.font.SysFont("Arial", int(30 * screenWidth/1500))

while running:
    pygame.draw.rect(screen,'white',(0,0,screenWidth,splitter - size // 2))
    currenttime += 1/FPS

    currentTarget.update()

    for event in pygame.event.get():
        if event.type == pygame.MOUSEBUTTONDOWN:
            hitstotal += 1
            if currentTarget.checkClick():
                currentTarget = target(screenWidth,screenHeight,size,splitter)
                hits += 1
        if event.type == pygame.QUIT:
            running = False
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_r:
                hits = 0
                hitstotal = 0
                currenttime = 0
            if event.key == pygame.K_x:
                running = False
            if event.key == pygame.K_t:
                hits = 0
                hitstotal = 0
                currenttime = 0
                trialtime = 30
                firsttrialended = True
            if event.key == pygame.K_y:
                hits = 0
                hitstotal = 0
                currenttime = 0
                trialtime = 15
                firsttrialended = True
    if hits == 0:
        accuracy = 0
    else:
        accuracy = hits/hitstotal*100
    currenttime = round(currenttime,2)

    if currenttime == 0:
        currentrate = 0.000
    else:
        currentrate = round(hits/currenttime,2)

    
    if trialtime > 0:
        trialoutputstring = 'TIME LEFT: ' + str(trialtime)
    elif trialtime == 0:
        displayed_score = int(currentrate * accuracy / currenttime * 100)
        trialoutputstring = ''
    else:
        if firsttrialended:
            trialoutputstring = 'TRIAL SCORE --- '+ str(displayed_score)
        else:
            trialoutputstring = ''


    currenttime = round(currenttime,2)
    draw("AimTrainer 2.0" + ' ' * 10 +' Press R to clear HPS and Accuracy' + ' ' * 10 + 'Press X to close' + ' ' * 10 + 'Press Y/T to launch 15/30 second trial',font,(textcolor),100,30)
    draw((f"Current accuracy is: {round(accuracy,2):<5}" + " " * 10 + f"Current hits per second: {currentrate :< 5}" + " " * 10 + f"Time since start/reset: {int(currenttime):< 5}" + " " * 10 + trialoutputstring).format(),font,(textcolor),100,80)
    pygame.display.update()
    screen.fill('black')
    time.sleep(1/FPS)
    trialtime -= 1/FPS
    trialtime = round(trialtime,2)

pygame.quit()