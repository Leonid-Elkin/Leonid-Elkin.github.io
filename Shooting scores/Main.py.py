from BoyClass import boy
from BookClass import book
from colorama import Fore, Back, Style, init

def merge(boys):
    merged_boys = {}
    # объединяет все классы мальчиков в один большой и объединяет дубликаты. реально нужно решение в своем классе
    for guy in boys:
        if guy.name not in merged_boys:
            merged_boys[guy.name] = {
                'fivebull': [[], [], []],
                'tenbull': [[], [], []],
                'xtras': []
            }
        
        for i in range(3):
            merged_boys[guy.name]['fivebull'][i].extend(guy.fiveBull[i])
        
        for i in range(3):
            merged_boys[guy.name]['tenbull'][i].extend(guy.tenBull[i])

        merged_boys[guy.name]['xtras'].extend(guy.xtras)
    
    result = []
    for name, data in merged_boys.items():
        result.append(boy(name, data['fivebull'], data['tenbull'], data['xtras']))
    
    return result


def select():
    for item in adresses:
        print(item)
    time = str(input("These are the available scoresheets that I can use. Type 'Total' to see combined results. Type '1, 2, 3' ext. to access specific sheets: "))
    if time.lower() == 'total':
        nameAsker(0)
    elif time.isnumeric():
        if int(time) > len(adresses):
            print(Fore.RED + "Out of range")
            select()
        nameAsker(int(time))
    
    else:
        print(Fore.RED + "Invalid input")
        select()

    
def nameAsker(selection):
    name = str(input("What is the name of the person you are trying to find: "))
    index = selectionlist[selection].findBoy(name)

    if index == -1:
        print(Fore.RED + "No such person in directory")
        nameAsker(selection)
    else:
        print(Fore.RED + "Person found")
        actionMenu(selection,index)


def actionMenu(selection,index):
    print("Commands: !plot5 - plots scores for 5  !plot10 - plots scores for 10  !avg5 - shows avg for 5 !avg10 - shows avg for 10  !leaderboard5 - shows leaderboard for 5   !leaderboard10 - shows leaderboard for 10")
    print("!return - return to selection menu   !changename - find another person  !misc - display misc stats like target sprint time  !quit - quit")
    command = input("")
    if command == "!plot5":
        selectionlist[selection].plotFiveAvg(index)   
        actionMenu(selection,index)    
    elif command == "!plot10":
        selectionlist[selection].plotTenAvg(index)
        actionMenu(selection,index)
    elif command == "!avg5":
        print(Fore.RED + "You average in this time period was: " + str(selectionlist[selection].getFiveAvg(index)))
        actionMenu(selection,index)
    elif command == "!avg10":
        print(Fore.RED + "You average in this time period was: " + str(selectionlist[selection].getTenAvg(index)))
        actionMenu(selection,index)
    elif command == "!return":
        select()
    elif command == "!changename":
        nameAsker(selection)
    elif command == "!leaderboard5":
        names,scores = selectionlist[selection].getTargetLeaderboard(5)
        for index in range(len(names)):
            print(Fore.RED + f'{index + 1}: {names[index]} average: {scores[index]} ')
        actionMenu(selection,index)
    elif command == "!leaderboard10":
        names,scores = selectionlist[selection].getTargetLeaderboard(10)
        for index in range(len(names)):
            print(Fore.RED + f'{index + 1}: {names[index]} average: {scores[index]}')
        actionMenu(selection,index)
    elif command == "!misc":
        selectionlist[selection].displayMisc(index)
        actionMenu(selection,index)
    elif command == "!quit":
        quit()
    else:
        print(Fore.RED + "unknown command")
        actionMenu(selection,index)


init(autoreset=True)
adresses = ["Scores/1 2022 Summer.xlsx","Scores/2 2022 Michaelmas Averages.xlsx","Scores/3 2024 Michaelmas Averages and Schedule.xlsx"]
booklist = []
superBoyList = []
for item in adresses:
    booklist.append(book()) 
for index,item in enumerate(booklist):
    superBoyList = item.gen(adresses[index],superBoyList)
superBoyList = merge(superBoyList)

superBook = book()
superBook.useExternalBoylist(superBoyList)

selectionlist = [superBook]
for item in booklist:
    selectionlist.append(item)

select()






    