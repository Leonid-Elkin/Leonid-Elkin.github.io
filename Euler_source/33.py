<<<<<<< HEAD
def doThing(lst):
    num = 0
    for m,i in enumerate(lst):
        num += int(i)*10**(len(lst)-int(m)-1)
    return num

def check(numerator,denominator):
    if numerator >= denominator:
        return 1
    
    s = list(str(numerator))
    d = list(str(denominator))

    actualvalue = numerator/denominator

    for number in range (10):

        if str(number) in s and str(number) in d:
            s = list(str(numerator))
            d = list(str(denominator))
            
            s.pop(s.index(number))
            d.pop(d.index(number))
            
            print(s,d)

            newratio = doThing(s) / doThing(d)

            print(actualvalue,newratio)

            if actualvalue == newratio:
                return actualvalue
    return 1

=======
def doThing(lst):
    num = 0
    for m,i in enumerate(lst):
        num += int(i)*10**(len(lst)-int(m)-1)
    return num

def check(numerator,denominator):
    if numerator >= denominator:
        return 1
    
    s = list(str(numerator))
    d = list(str(denominator))

    actualvalue = numerator/denominator

    for number in range (10):

        if str(number) in s and str(number) in d:
            s = list(str(numerator))
            d = list(str(denominator))
            
            s.pop(s.index(number))
            d.pop(d.index(number))
            
            print(s,d)

            newratio = doThing(s) / doThing(d)

            print(actualvalue,newratio)

            if actualvalue == newratio:
                return actualvalue
    return 1

>>>>>>> e04ab7b2ea1636b5dcc3e71a69e9bfbf0ec057d3
print(check(49,98))