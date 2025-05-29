import matplotlib.pyplot as plt
from datetime import datetime
import numpy as np
import matplotlib.ticker as ticker
from colorama import Fore, Back, Style, init

class boy():
    init(autoreset=True)
    def __init__(self,name,fiveBull,tenBull,xtras):
        self.name = name
        self.fiveBull = fiveBull
        self.tenBull = tenBull
        self.xtras = xtras
    # каждый целевой список имеет древовидные списки - данные, время и тип цели str + 2*3 + lst
    def getFiveAvg(self):
        if len(self.fiveBull[0]) != 0:
            return round(sum(self.fiveBull[0])/len(self.fiveBull[0]),2)
        return 0
    def getTenAvg(self):
        if len(self.tenBull[0]) != 0:
            return round(sum(self.tenBull[0])/len(self.tenBull[0]),2)
        return 0
    def displayMisc(self):
        print(Fore.RED +f'Target sprint: {self.xtras[0]}')
        print(Fore.RED +f'Tunbridge Wells 50m: {self.xtras[1]}')
        print(Fore.RED +f'Tunbridge Wells 50m: {self.xtras[2]}')
        print(Fore.RED +f'Kent Schools 50m: {self.xtras[3]}')
        print(Fore.RED +f'Kent Schools 100y: {self.xtras[4]}')
        print(Fore.RED +f'Rapid 5 bull: {self.xtras[5]}')
        print(Fore.RED +f'Skirmisher <3: {self.xtras[6]}')
        print(Fore.RED +f'Full bore comp: {self.xtras[7]}')
        print(Fore.RED +f'Ashburton: {self.xtras[8]}')

    def plot(self,score,time):

        if len(score) == 0:
            return False
        else:
            time_numeric = [(t - time[0]).days for t in time]
    
            linear_coefficients = np.polyfit(time_numeric, score, 1)
            linear_model = np.poly1d(linear_coefficients)

            cubic_coefficients = np.polyfit(time_numeric, score, 3)
            cubic_model = np.poly1d(cubic_coefficients)
            #нужна кривая получше, эта отстой и по какой-то причине перекрывает чертовы точки
            time_smooth = np.linspace(time_numeric[0], time_numeric[-1], 500)
            linear_curve = linear_model(time_smooth)
            cubic_curve = cubic_model(time_smooth)

            plt.figure(figsize=(10, 6))
            plt.plot(time_numeric, score, 'o', label="Original Data Points", color='red')
            plt.plot(time_smooth, linear_curve, label="Linear Fit", color='green')
            plt.plot(time_smooth, cubic_curve, label="Cubic Fit", color='blue')
            
            plt.title(f'{self.name} Score vs Time')
            plt.xlabel('Time (Days Since Start)')
            plt.ylabel('Score')
            # Я не нашел более эффективного способа сделать это
            ax = plt.gca() 
            ax.xaxis.set_major_locator(ticker.MaxNLocator(integer=True, prune='both', nbins=6)) 

            ax.set_xticklabels([time[i].strftime('%Y-%m-%d') for i in range(len(time))], rotation=45, ha='right')
            #Я не знаю, как это работает, и иногда это выдает предупреждения – ИСПРАВИТЬ
            plt.grid(True)
            plt.legend()
            plt.tight_layout()

            plt.show()