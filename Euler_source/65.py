def approximate(depth):
    if depth >= 2:
        number = 2.5
        for i in range (depth-1):
            number = 1/(number + 2)
        return number


print(approximate(4))