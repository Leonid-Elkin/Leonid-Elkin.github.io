
def prep():
    Pokerfile = open("C:\\Users\\walru\\OneDrive\\Рабочий стол\\Python\\Project Euler 50-100\\54\\Cards.txt","r")
    Pokerlist = list(Pokerfile.read().split('\n'))
    for item in range(len(Pokerlist)):
        Pokerlist[item] = Pokerlist[item].split(" ")
    return Pokerlist

def convert(character):
    
    if character == 'T':
        return 10
    elif character == 'J':
        return 11
    elif character == 'Q':
        return 12
    elif character == 'K':
        return 13
    elif character == 'A':
        return 14
    else:
        return int(character)

def compileCardNumbers(Cards):
    print(Cards)
    Player1List = []
    Player2List = []
    OutputList = []

    for i in range (5):
        Player1List.append([convert(list(Cards[i])[0]),list(Cards[i])[1]])
        Player2List.append([convert(list(Cards[i + 5])[0]),list(Cards[i + 5])[1]])

    Player1List.sort(reverse=True)
    Player2List.sort(reverse=True)


    OutputList.append(Player1List)
    OutputList.append(Player2List)

    return OutputList
    
fileinfo = prep()

def checkHighCard(Cards):


    Player1Cards = Cards[0]
    Player2Cards = Cards[1]
    index = 0

    while True:

        if Player1Cards[index] > Player2Cards[index]:
            return 1
        elif Player2Cards[index] > Player1Cards[index]:
            return 2
        else:
            index += 1

def checkMultiples(Cards,index):

    Player1Cards = Cards[0]
    Player2Cards = Cards[1]

    Player1Pairs = 0
    Player2Pairs = 0
    HighestPair = 0

    for card in range (2,15):
        if Player1Cards.count(card) == index:
            Player1Pairs += 1
            HighestPair = 1
        if Player2Cards.count(card) == index:
            Player2Pairs += 1
            HighestPair = 2

    if Player1Pairs > Player2Pairs:
        return 1
    elif Player1Pairs == Player2Pairs:
        
        return HighestPair

    else: 
        return 2

def checkIfStraight(Cards):

    Player1Cards = Cards[0]
    Player2Cards = Cards[1]

    IsPlayer1Straight = True
    IsPlayer2Straight = True
    HighestCardNum = 0
    HighestCard = 0

    for i in range (4):
        if Player1Cards[i] + 1 != Player1Cards[i + 1]:
            IsPlayer1Straight = False
            HighestCard = 1
        if Player2Cards[i] + 1 != Player2Cards[i + 1]:
            IsPlayer2Straight = False
            HighestCard = 2

    if IsPlayer1Straight:
        if IsPlayer2Straight:
            return HighestCard
        return 1
    else:
        if IsPlayer2Straight:
            return 2

def checkFlush(CardSuits):
    
    Player1Cards = CardSuits[0]
    Player2Cards = CardSuits[1]

    isPlayer1Flush = True
    isPlayer2Flush = True
    HighestCard = 0
    
    for i in range (4):
        if Player1Cards[i] != Player1Cards[i + 1]:
            isPlayer1Flush = False
            HighestCard = 1
        if Player2Cards[i] != Player2Cards[i + 1]:
            isPlayer2Flush = False
            HighestCard = 2

    if isPlayer1Flush:
        if isPlayer2Flush:
            return HighestCard
        return 1
    else:
        if isPlayer2Flush:
            return 2
        return HighestCard