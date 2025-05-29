<<<<<<< HEAD
def approximate(depth):
    if depth >= 2:
        number = 2.5
        for i in range (depth-1):
            number = 1/(number + 2)
        return number


=======
def approximate(depth):
    if depth >= 2:
        number = 2.5
        for i in range (depth-1):
            number = 1/(number + 2)
        return number


>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(approximate(4))