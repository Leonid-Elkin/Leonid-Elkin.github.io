def check(num):
    lst = list('[%s]' % ', '.join(map(str, num)))
    print(lst)
    if len(lst) == 27:
        for i in range (1,10):
            if i not in lst:
                return False
        return True
    return False
list = ['1','2','3','4','5','6','7','8','9']
print(check(list))

amount = 0
dynamiclist = []
for number1 in range (10,40):
    numlist = []
    for number2 in range (100,188):
        
        
