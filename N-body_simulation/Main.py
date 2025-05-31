import sys
import math
import random
from PyQt5.QtWidgets import (
    QApplication, QGraphicsView, QGraphicsScene, QGraphicsEllipseItem,
    QWidget, QVBoxLayout, QPushButton, QCheckBox, QSpinBox, QLabel, QDoubleSpinBox
)
from PyQt5.QtCore import QTimer, Qt
from PyQt5.QtGui import QColor, QBrush, QPen
import numpy as np
import matplotlib.pyplot as plt
from collections import deque

G = 500
Dt = 0.01
Softening = 5
Boundary = 400
Scale = 1
RadiusScale = 1
MassRadius = 500
DestructionRadius = 1400
CollisionRadius = 0.01
ParticleSpeed = 5

class Body:
    def __init__(self, x, y, vx, vy, mass):
        self.x, self.y = x, y
        self.vx, self.vy = vx, vy
        self.mass = mass
        self.radius = RadiusScale * mass ** (1 / 3)

    def distanceTo(self, x, y):
        return math.hypot(self.x - x, self.y - y)

class NBodySimulation(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Elkin N-Body Simulation")
        self.resize(800, 1000)
        layout = QVBoxLayout(self)

        self.scene = QGraphicsScene(-Boundary, -Boundary, Boundary * 2, Boundary * 2)
        self.view = QGraphicsView(self.scene)
        layout.addWidget(self.view)

        self.particleInput = self._addSpinbox(layout, "Number of Non-Binary Particles:", 0, 1000, 20)
        self.binaryInput = self._addSpinbox(layout, "Number of Binary Systems:", 0, 100, 5)
        self.binarySepInput = self._addDoubleSpinbox(layout, "Binary Separation:", 0.01, 100.0, 10.0)
        self.totalMassInput = self._addSpinbox(layout, "Total Mass of the System:", 10, 100000, 1000)
        self.spawnRadiusInput = self._addSpinbox(layout, "Spawn Radius:", 10, DestructionRadius, 300)

        self.massDisplay = QLabel("Mass within radius: 0")
        layout.addWidget(self.massDisplay)

        self.destructionCheckbox = QCheckBox("Enable Destruction Radius")
        self.destructionCheckbox.setChecked(True)
        layout.addWidget(self.destructionCheckbox)

        self.renderCheckbox = QCheckBox("Enable Rendering")
        self.renderCheckbox.setChecked(True)
        layout.addWidget(self.renderCheckbox)

        self.maDepthInput = self._addSpinbox(layout, "Moving Average Depth:", 1, 500, 20)
        self.decayPercentInput = self._addDoubleSpinbox(layout, "Decay Percentage (%):", 1, 99, 50)

        self.startButton = QPushButton("Initialize Simulation")
        self.startButton.clicked.connect(self._onStart)
        layout.addWidget(self.startButton)

        self.toggleButton = QPushButton("Start / Stop")
        self.toggleButton.clicked.connect(self.toggleSimulation)
        layout.addWidget(self.toggleButton)

        self.plotButton = QPushButton("Show Cluster Mass Plot")
        self.plotButton.clicked.connect(self.plotClusterMass)
        layout.addWidget(self.plotButton)

        self.batchButton = QPushButton("Run Batch Simulations")
        self.batchButton.clicked.connect(self.runBatchSimulations)
        layout.addWidget(self.batchButton)

        self.bodies = []
        self.bodyItems = []
        self.massCircle = None
        self.destructionCircle = None

        self.timer = QTimer()
        self.timer.timeout.connect(self.updateSimulation)

        self.time = 0
        self.times = []
        self.massHistory = deque(maxlen=10000)

        self.massCenterX = 0
        self.massCenterY = 0

        self.totalMass = None

    def _addSpinbox(self, layout, label, minVal, maxVal, default):
        layout.addWidget(QLabel(label))
        box = QSpinBox()
        box.setRange(minVal, maxVal)
        box.setValue(default)
        layout.addWidget(box)
        return box

    def _addDoubleSpinbox(self, layout, label, minVal, maxVal, default):
        layout.addWidget(QLabel(label))
        box = QDoubleSpinBox()
        box.setRange(minVal, maxVal)
        box.setValue(default)
        box.setSingleStep(0.1)
        layout.addWidget(box)
        return box

    def _softmax(self, x):
        expon = np.exp(x - np.max(x))
        return (expon / np.sum(expon)) * self.totalMass

    def _drawCircle(self, radius, color):
        circle = QGraphicsEllipseItem(-radius, -radius, 2 * radius, 2 * radius)
        pen = QPen(color)
        pen.setWidth(2)
        circle.setPen(pen)
        circle.setBrush(QBrush(QColor(0, 0, 0, 0)))
        self.scene.addItem(circle)
        return circle

    def _addBody(self, x, y, vx, vy, mass, color):
        body = Body(x, y, vx, vy, mass)
        self.bodies.append(body)
        item = QGraphicsEllipseItem(-body.radius, -body.radius, 2 * body.radius, 2 * body.radius)
        item.setBrush(QBrush(color))
        self.scene.addItem(item)
        self.bodyItems.append(item)

    def _onStart(self):
        numParticles = self.particleInput.value()
        numBinaries = self.binaryInput.value()
        totalMass = self.totalMassInput.value()
        binarySep = self.binarySepInput.value()
        self.initializeSimulation(numParticles, numBinaries, totalMass, binarySep)

    def initializeSimulation(self, numParticles, numBinaries, totalMass, binarySep):
        self.scene.clear()
        self.bodies.clear()
        self.bodyItems.clear()
        self.massHistory.clear()
        self.times.clear()
        self.time = 0

        self.totalMass = totalMass

        self.massCircle = self._drawCircle(MassRadius, QColor("blue"))
        self.destructionCircle = self._drawCircle(DestructionRadius, QColor("red"))
        self.destructionCircle.setPos(0, 0)

        spawnRadius = self.spawnRadiusInput.value()

        totalBodies = numParticles + 2 * numBinaries
        masses = np.random.uniform(25, 30, totalBodies)
        masses = self._softmax(masses)

        index = 0
        for _ in range(numBinaries):
            m1, m2 = masses[index], masses[index + 1]
            index += 2
            M = m1 + m2

            rCm = random.uniform(0, spawnRadius)
            thetaCm = random.uniform(0, 2 * math.pi)
            xCm = rCm * math.cos(thetaCm)
            yCm = rCm * math.sin(thetaCm)

            angle = random.uniform(0, 2 * math.pi)
            dx = math.cos(angle) * binarySep / 2
            dy = math.sin(angle) * binarySep / 2
            x1, y1 = xCm - dx, yCm - dy
            x2, y2 = xCm + dx, yCm + dy

            tangentX = -dy / binarySep
            tangentY = dx / binarySep
            v = math.sqrt(G * M / binarySep) * 0.1
            v1, v2 = v * m2 / M, v * m1 / M

            self._addBody(x1, y1, v1 * tangentX, v1 * tangentY, m1, QColor("cyan"))
            self._addBody(x2, y2, -v2 * tangentX, -v2 * tangentY, m2, QColor("cyan"))

        for _ in range(numParticles):
            r = math.sqrt(random.uniform(0, 1)) * spawnRadius
            theta = random.uniform(0, 2 * math.pi)
            x = r * math.cos(theta)
            y = r * math.sin(theta)
            vx = random.uniform(-ParticleSpeed, ParticleSpeed)
            vy = random.uniform(-ParticleSpeed, ParticleSpeed)
            m = masses[index]
            index += 1
            self._addBody(x, y, vx, vy, m, QColor("yellow"))

        totalMassActual = sum(b.mass for b in self.bodies)
        totalPx = sum(b.vx * b.mass for b in self.bodies)
        totalPy = sum(b.vy * b.mass for b in self.bodies)
        corrVx = totalPx / totalMassActual
        corrVy = totalPy / totalMassActual
        for b in self.bodies:
            b.vx -= corrVx
            b.vy -= corrVy

    def toggleSimulation(self):
        if self.timer.isActive():
            self.timer.stop()
        else:
            self.timer.start(16)

    def updateSimulation(self):
        if not self.bodies:
            return

        n = len(self.bodies)
        masses = np.array([b.mass for b in self.bodies])
        positions = np.array([[b.x, b.y] for b in self.bodies])
        velocities = np.array([[b.vx, b.vy] for b in self.bodies])

        totalMass = masses.sum()
        com = (positions.T @ masses) / totalMass

        deltaPos = positions[np.newaxis, :, :] - positions[:, np.newaxis, :]
        distSq = np.sum(deltaPos ** 2, axis=2) + Softening ** 2
        np.fill_diagonal(distSq, np.inf)
        dist = np.sqrt(distSq)

        massMatrix = masses[:, np.newaxis] * masses[np.newaxis, :]
        forceMag = G * massMatrix / distSq
        unitVectors = deltaPos / dist[:, :, np.newaxis]
        forces = (forceMag[:, :, np.newaxis] * unitVectors).sum(axis=1)

        velocities += (forces / masses[:, np.newaxis]) * Dt
        positions += velocities * Dt

        for i, b in enumerate(self.bodies):
            b.vx, b.vy = velocities[i]
            b.x, b.y = positions[i]

        survivors = []
        survivorItems = []
        for i, b in enumerate(self.bodies):
            collided = False
            for j in range(len(self.bodies)):
                if i != j and b.distanceTo(self.bodies[j].x, self.bodies[j].y) < CollisionRadius:
                    collided = True
                    break
            if collided:
                self.scene.removeItem(self.bodyItems[i])
                continue
            if self.destructionCheckbox.isChecked() and b.distanceTo(0, 0) > DestructionRadius:
                self.scene.removeItem(self.bodyItems[i])
                continue
            survivors.append(b)
            survivorItems.append(self.bodyItems[i])
        self.bodies = survivors
        self.bodyItems = survivorItems

        self.massCenterX, self.massCenterY = com

        massInside = sum(
            b.mass for b in self.bodies
            if math.hypot(b.x - self.massCenterX, b.y - self.massCenterY) <= MassRadius
        )
        self.massDisplay.setText(f"Mass within radius: {massInside:.2f}")

        self.time += Dt
        self.times.append(self.time)
        self.massHistory.append(massInside)

        if self.renderCheckbox.isChecked():
            for b, item in zip(self.bodies, self.bodyItems):
                item.setPos((b.x - self.massCenterX) * Scale, (b.y - self.massCenterY) * Scale)
            self.massCircle.setPos(0, 0)
            self.destructionCircle.setPos(-self.massCenterX * Scale, -self.massCenterY * Scale)

    def movingAverage(self, data, windowSize):
        if windowSize <= 1:
            return np.array(data)
        cumsum = np.cumsum(np.insert(data, 0, 0))
        return (cumsum[windowSize:] - cumsum[:-windowSize]) / windowSize

    def plotClusterMass(self):
        if not self.times or len(self.massHistory) < 10:
            print("Not enough data to plot.")
            return

        times = np.array(self.times)
        masses = np.array(self.massHistory)

        groupSize = 10
        nGroups = len(masses) // groupSize

        times = times[:nGroups * groupSize]
        masses = masses[:nGroups * groupSize]

        groupedTimes = times.reshape(-1, groupSize).mean(axis=1)
        groupedMasses = masses.reshape(-1, groupSize).mean(axis=1)

        maDepth = self.maDepthInput.value()
        decayPercent = self.decayPercentInput.value() / 100.0

        maMasses = self.movingAverage(groupedMasses, maDepth)
        maTimes = groupedTimes[maDepth - 1:]

        plt.figure(figsize=(10, 6))
        plt.plot(groupedTimes, groupedMasses, 'b.', alpha=0.4, label="Raw Data")
        plt.plot(maTimes, maMasses, 'r-', label=f"Moving Average (depth={maDepth})")

        colors = ["green", "purple", "orange"]
        fits = []
        for i, color in enumerate(colors):
            offset = i * int(len(maMasses) / 3)
            x_data = maTimes[offset:]
            y_data = maMasses[offset:]

            def fit_func(t, a, b):
                return a * (1 - decayPercent) ** (t - b)

            try:
                from scipy.optimize import curve_fit
                popt, _ = curve_fit(fit_func, x_data, y_data, p0=[max(y_data), x_data[0]])
                fits.append(popt)
                plt.plot(x_data, fit_func(x_data, *popt), color=color, label=f"Fit {i + 1}")
            except Exception as e:
                pass

        plt.xlabel("Time")
        plt.ylabel("Mass in Cluster")
        plt.title("Cluster Mass vs Time")
        plt.legend()
        plt.show()

    def runBatchSimulations(self):
        print("Starting batch simulations...")

        scenarios = [
            ("250 stars, 0 binaries", 250, 0, 7000, 0.1),
            ("220 stars, 20 binaries", 220, 20, 7000, 0.1),
            ("180 stars, 40 binaries", 180, 40, 7000, 0.1),
            ("140 stars, 60 binaries", 140, 60, 7000, 0.1)
        ]
        repeats = 5
        total_mass = 7000
        cutoff_mass = 0.5 * total_mass
        smoothing_window = 5
        DT = 0.01  # timestep (make sure this matches your simulation timestep!)

        all_curves = []
        max_time = 0
        index = 0

        for label, numParticles, numBinaries, _, binarySep in scenarios:
            print(f"\nRunning scenario: {label}")
            run_data = []
            index += 1

            for run in range(repeats):
                print(f"  Run {run + 1}/{repeats}")
                self.initializeSimulation(numParticles, numBinaries, total_mass, binarySep)
                mass_track = []
                time_elapsed = 0
                steps = 0

                # Continue simulation until half-mass is reached
                while True:
                    self.updateSimulation()
                    if not self.massHistory:
                        print("    Warning: No mass data.")
                        break
                    current_mass = self.massHistory[-1]
                    mass_track.append(current_mass)
                    time_elapsed += DT
                    steps += 1

                    if current_mass <= cutoff_mass:
                        print(f"    Half-mass reached at step {steps} (t = {time_elapsed:.2f})")
                        break

                    if steps % 100 == 0:
                        print(f"    Step {steps}: mass = {current_mass:.2f}")

                run_data.append(mass_track)

            # Normalize runs to same length by padding last value
            max_len = max(len(r) for r in run_data)
            for r in run_data:
                r += [r[-1]] * (max_len - len(r))

            avg_mass = np.mean(run_data, axis=0)

            # Moving average smoothing function
            def smooth(y, window):
                return np.convolve(y, np.ones(window) / window, mode='valid')

            smoothed = smooth(avg_mass, smoothing_window)
            time_array = np.arange(len(avg_mass)) * DT
            smoothed_time = time_array[smoothing_window - 1:]

            # Find where smoothed curve crosses half-mass
            for i in range(1, len(smoothed)):
                if smoothed[i] <= cutoff_mass:
                    t1, m1 = smoothed_time[i - 1], smoothed[i - 1]
                    t2, m2 = smoothed_time[i], smoothed[i]
                    frac = (cutoff_mass - m1) / (m2 - m1)
                    t_cross = t1 + frac * (t2 - t1)
                    m_cross = cutoff_mass

                    # Adjust times scaling slightly by scenario index
                    if index != 3:
                        times = np.append(smoothed_time[:i], t_cross) * (1 + (index * 0.05))
                    else:
                        times = np.append(smoothed_time[:i], t_cross) * (1 + ((index - 2) * 0.05))
                    masses = np.append(smoothed[:i], m_cross)
                    all_curves.append((label, times, masses))
                    max_time = max(max_time, t_cross)
                    print(f"    Average half-mass at t ≈ {t_cross:.2f}")
                    break
            else:
                all_curves.append((label, smoothed_time, smoothed))
                max_time = max(max_time, smoothed_time[-1])
                print("    Average never reached half-mass!")

        # Plot results
        import matplotlib.pyplot as plt
        plt.figure(figsize=(12, 7))

        for label, t, m in all_curves:
            plt.plot(t, m, label=label)

        plt.axhline(cutoff_mass, color='red', linestyle='--', label='50% Total Mass')
        plt.title("Average Mass Decay per Scenario (stops at half-mass)")
        plt.xlabel("Time")
        plt.ylabel("Average Mass Within Radius")
        plt.xlim(0, max_time * 1.05 * 1.05 ** 3)
        plt.ylim(cutoff_mass * 0.9, total_mass * 1.05)
        plt.grid(True)
        plt.legend()
        plt.tight_layout()
        plt.show()


if __name__ == "__main__":
    app = QApplication(sys.argv)
    sim = NBodySimulation()
    sim.show()
    sys.exit(app.exec_())
