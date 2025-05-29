<<<<<<< HEAD
import math

def scan(triangle):
    newsecond = []
    for index,number in enumerate(triangle[-2]):
        if int(triangle[-1][index]) > int(triangle[-1][index + 1]):
            newsecond.append(int(triangle[-1][index]) + int(number))
        else:
            newsecond.append(int(triangle[-1][index + 1]) + int(number))
    
    newar = []
    for i in range (len(triangle) - 2):
        sublst = []
        for iter in range (i + 1):
            sublst.append(triangle[i][iter])
        newar.append(sublst)

    newar.append(newsecond)
    return newar


triangle = []
with open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 1-50\\18\\FileInfo.txt", "r") as dataFile:
    for i in dataFile:
        i = i.strip().split(" ")
        triangle.append(i)

while len(triangle) != 1:
    triangle = scan(triangle)
=======
import math

def scan(triangle):
    newsecond = []
    for index,number in enumerate(triangle[-2]):
        if int(triangle[-1][index]) > int(triangle[-1][index + 1]):
            newsecond.append(int(triangle[-1][index]) + int(number))
        else:
            newsecond.append(int(triangle[-1][index + 1]) + int(number))
    
    newar = []
    for i in range (len(triangle) - 2):
        sublst = []
        for iter in range (i + 1):
            sublst.append(triangle[i][iter])
        newar.append(sublst)

    newar.append(newsecond)
    return newar


triangle = []
with open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 1-50\\18\\FileInfo.txt", "r") as dataFile:
    for i in dataFile:
        i = i.strip().split(" ")
        triangle.append(i)

while len(triangle) != 1:
    triangle = scan(triangle)
>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(triangle[0][0])