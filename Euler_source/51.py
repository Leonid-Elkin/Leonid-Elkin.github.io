import math
import itertools


def isPrime(number):
    for factor in range (2,int(math.sqrt(self.number)) - 1):
        if self.number % factor == 0:
            return False
    return True

def checkIteration():

def generateIterations(length):
    iterlist = []
    for i in range (length):
        iterlist.append(0)
        iterlist.append(1)
    iterlist = list(itertools.permutations(iterlist,length))
    for item in iterlist:
        if iterlist.count(item) > 1:
            iterlist.pop(iterlist.index(item))
    return iterlist

