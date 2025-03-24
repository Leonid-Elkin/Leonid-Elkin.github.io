from math import sqrt

maxnum = 1_000_000
plist = []

def isPrime(number):
    for factor in range (2,int(sqrt(number) + 1)):
        if number % factor == 0:
            return False
    return True

def findChainLength(primelist):
    maxchain = 0
    currentlargest = 0
    
    for startprimeindex in range (len(primelist)):
        currentnum = 0
        currentchain = 0
        indexindex = startprimeindex

        while currentnum < primelist[-1]:
            currentnum += primelist[indexindex]
            indexindex += 1
            currentchain += 1

            if isPrime(currentnum):
                if currentchain > maxchain:
                    maxchain = currentchain
                    currentlargest = currentnum
                    
    return maxchain, currentlargest




for i in range (2,maxnum):
    if isPrime(i):
        plist.append(i)

print(findChainLength(plist))