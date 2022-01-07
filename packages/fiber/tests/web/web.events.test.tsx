jest.mock('scheduler', () => require('scheduler/unstable_mock'))

import * as React from 'react'
import { render, fireEvent, RenderResult, cleanup } from '@testing-library/react'
import { createWebGLContext } from '@react-three/test-renderer/src/createWebGLContext'

import { Canvas, act } from '../../src/web/index'
import { ThreeEvent } from '../../src/core/events'

// @ts-ignore
HTMLCanvasElement.prototype.getContext = function () {
  return createWebGLContext(this)
}

function fireMouseEvent(name: string, { offsetX = 0, offsetY = 0 }): MouseEvent {
  const ev = new MouseEvent(name)
  //@ts-ignore
  ev.offsetX = offsetX
  //@ts-ignore
  ev.offsetY = offsetY

  fireEvent(document.querySelector('canvas') as HTMLCanvasElement, ev)
  return ev
}

function firePointerEvent(name: string, { offsetX = 0, offsetY = 0, pointerId = 1 }): PointerEvent {
  const ev = new PointerEvent(name)
  //@ts-ignore
  ev.offsetX = offsetX
  //@ts-ignore
  ev.offsetY = offsetY
  //@ts-ignore
  ev.pointerId = pointerId

  fireEvent(document.querySelector('canvas') as HTMLCanvasElement, ev)
  return ev
}

function fireClickEvent(options: { offsetX?: number; offsetY?: number } = {}): MouseEvent {
  firePointerEvent('pointerdown', options)
  firePointerEvent('pointerup', options)
  return fireMouseEvent('click', options)
}

describe('events', () => {
  it('can handle onPointerDown', async () => {
    const handlePointerDown = jest.fn()

    await act(async () => {
      render(
        <Canvas>
          <mesh onPointerDown={handlePointerDown}>
            <boxGeometry args={[2, 2]} />
            <meshBasicMaterial />
          </mesh>
        </Canvas>,
      )
    })

    firePointerEvent('pointerdown', { offsetX: 577, offsetY: 480 })

    expect(handlePointerDown).toHaveBeenCalled()
  })

  describe('bubbling', () => {
    it('bubbles pointer events to ancestors', async () => {
      const handlePointerDownInner = jest.fn()
      const handlePointerDownOuter = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <group onPointerDown={handlePointerDownOuter}>
              <group onPointerDown={handlePointerDownInner}>
                <mesh>
                  <boxGeometry args={[2, 2]} />
                  <meshBasicMaterial />
                </mesh>
              </group>
            </group>
          </Canvas>,
        )
      })

      firePointerEvent('pointerdown', { offsetX: 577, offsetY: 480 })

      expect(handlePointerDownInner).toHaveBeenCalledTimes(1)
      expect(handlePointerDownOuter).toHaveBeenCalledTimes(1)
    })

    it('bubbles click to ancestors', async () => {
      const handleClick = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <group onClick={handleClick}>
              <mesh>
                <boxGeometry args={[2, 2]} />
                <meshBasicMaterial />
              </mesh>
            </group>
          </Canvas>,
        )
      })

      fireClickEvent({ offsetX: 577, offsetY: 480 })
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('bubbles hovers to ancestors', async () => {
      const handlePointerOverInner = jest.fn()
      const handlePointerOutInner = jest.fn()

      const handlePointerOverOuter = jest.fn()
      const handlePointerOutOuter = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <group onPointerOver={handlePointerOverOuter} onPointerOut={handlePointerOutOuter}>
              <mesh onPointerOver={handlePointerOverInner} onPointerOut={handlePointerOutInner}>
                <boxGeometry args={[2, 2]} />
                <meshBasicMaterial />
              </mesh>
            </group>
          </Canvas>,
        )
      })

      firePointerEvent('pointermove', { offsetX: 577, offsetY: 480 })
      expect(handlePointerOverInner).toHaveBeenCalledTimes(1)
      expect(handlePointerOverOuter).toHaveBeenCalledTimes(1)

      firePointerEvent('pointermove', {})
      expect(handlePointerOutInner).toHaveBeenCalledTimes(1)
      expect(handlePointerOutOuter).toHaveBeenCalledTimes(1)
    })

    it('bubbles through ancestors with no handlers', async () => {
      const handlePointerDownOuter = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <group onPointerDown={handlePointerDownOuter}>
              {/* no handlers */}
              <group>
                <mesh>
                  <boxGeometry args={[2, 2]} />
                  <meshBasicMaterial />
                </mesh>
              </group>
            </group>
          </Canvas>,
        )
      })

      firePointerEvent('pointerdown', { offsetX: 577, offsetY: 480 })

      expect(handlePointerDownOuter).toHaveBeenCalledTimes(1)
    })

    describe('stopPropagation', () => {
      it('prevents calling parent handlers', async () => {
        const handleInner = jest.fn((ev: ThreeEvent<PointerEvent>) => ev.stopPropagation())
        const handleOuter = jest.fn()

        await act(async () => {
          render(
            <Canvas>
              <group onPointerDown={handleOuter}>
                <group onPointerDown={handleInner}>
                  <mesh>
                    <boxGeometry args={[2, 2]} />
                    <meshBasicMaterial />
                  </mesh>
                </group>
              </group>
            </Canvas>,
          )
        })

        firePointerEvent('pointerdown', { offsetX: 577, offsetY: 480 })
        expect(handleInner).toHaveBeenCalledTimes(1)
        expect(handleOuter).not.toHaveBeenCalled()
      })

      it('stops the event propagating outside the canvas', async () => {
        const handleInner = jest.fn((ev: ThreeEvent<PointerEvent>) => ev.stopPropagation())
        const handleOuter = jest.fn()

        await act(async () => {
          render(
            <div onPointerDown={handleOuter}>
              <Canvas>
                <mesh onPointerDown={handleInner}>
                  <boxGeometry args={[2, 2]} />
                  <meshBasicMaterial />
                </mesh>
              </Canvas>
            </div>,
          )
        })

        firePointerEvent('pointerdown', { offsetX: 577, offsetY: 480 })
        expect(handleInner).toHaveBeenCalledTimes(1)
        expect(handleOuter).not.toHaveBeenCalled()
      })
    })

    it('does not go through objects with handlers to objects behind', async () => {
      const handleClickFront = jest.fn()
      const handleClickRear = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <mesh onClick={handleClickFront}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
            <mesh onClick={handleClickRear} position-z={-3}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })

      fireClickEvent({ offsetX: 577, offsetY: 480 })
      expect(handleClickFront).toHaveBeenCalledTimes(1)
      expect(handleClickRear).not.toHaveBeenCalled()
    })
  })

  describe('onPointerMissed', () => {
    it('is called on a leaf node', async () => {
      const handleClick = jest.fn()
      const handleMissed = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <mesh onPointerMissed={handleMissed} onClick={handleClick}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })

      const ev = fireClickEvent()

      expect(handleClick).not.toHaveBeenCalledTimes(1)
      expect(handleMissed).toHaveBeenCalledWith(ev)
    })

    it('is not called when same element is clicked', async () => {
      const handleClick = jest.fn()
      const handleMissed = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <mesh onPointerMissed={handleMissed} onClick={handleClick}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })

      fireClickEvent({ offsetX: 577, offsetY: 480 })

      expect(handleClick).toHaveBeenCalledTimes(1)
      expect(handleMissed).not.toHaveBeenCalled()
    })

    it('is not called on parent when child element is clicked', async () => {
      const handleClick = jest.fn()
      const handleMissed = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <group onPointerMissed={handleMissed}>
              <mesh onClick={handleClick}>
                <boxGeometry args={[2, 2]} />
                <meshBasicMaterial />
              </mesh>
            </group>
          </Canvas>,
        )
      })

      fireClickEvent({ offsetX: 577, offsetY: 480 })

      expect(handleClick).toHaveBeenCalledTimes(1)
      expect(handleMissed).not.toHaveBeenCalled()
    })

    it('is called on Canvas when nothing is clicked', async () => {
      const handleMissed = jest.fn()

      await act(async () => {
        render(
          <Canvas onPointerMissed={handleMissed}>
            <mesh>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })

      const ev = fireClickEvent()
      expect(handleMissed).toHaveBeenCalledWith(ev)
    })
  })

  describe('hover', () => {
    const handlePointerOver = jest.fn()
    const handlePointerMove = jest.fn()
    const handlePointerOut = jest.fn()

    beforeEach(async () => {
      await act(async () => {
        render(
          <Canvas>
            <mesh onPointerOver={handlePointerOver} onPointerMove={handlePointerMove} onPointerOut={handlePointerOut}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })
    })

    afterEach(() => {
      handlePointerOver.mockClear()
      handlePointerMove.mockClear()
      handlePointerOut.mockClear()
      cleanup()
    })

    it('does not call handlers if the pointer is outside', () => {
      firePointerEvent('pointermove', { offsetX: 0, offsetY: 0 })

      expect(handlePointerOver).not.toHaveBeenCalled()
      expect(handlePointerMove).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()

      firePointerEvent('pointerout', { offsetX: 0, offsetY: 0 })

      expect(handlePointerOver).not.toHaveBeenCalled()
      expect(handlePointerMove).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()

      firePointerEvent('pointerover', { offsetX: 0, offsetY: 0 })

      expect(handlePointerOver).not.toHaveBeenCalled()
      expect(handlePointerMove).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()
    })

    it('calls handlers when over the object', () => {
      firePointerEvent('pointermove', { offsetX: 577, offsetY: 480 })

      expect(handlePointerOver).toHaveBeenCalledTimes(1)
      expect(handlePointerMove).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()

      firePointerEvent('pointermove', { offsetX: 577, offsetY: 480 })

      expect(handlePointerOver).toHaveBeenCalledTimes(1)
      expect(handlePointerMove).toHaveBeenCalledTimes(1)
      expect(handlePointerOut).not.toHaveBeenCalled()

      firePointerEvent('pointermove', { offsetX: 0, offsetY: 0 })
      expect(handlePointerOver).toHaveBeenCalledTimes(1)
      expect(handlePointerMove).toHaveBeenCalledTimes(1)
      expect(handlePointerOut).toHaveBeenCalledTimes(1)
    })
  })

  describe('an object with no over/out handlers', () => {
    const handlePointerOver = jest.fn()
    const handlePointerOut = jest.fn()
    const handleClick = jest.fn()

    beforeEach(async () => {
      await act(async () => {
        render(
          <Canvas>
            <mesh name="front" onClick={handleClick}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
            <mesh name="rear" onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} position-z={-3}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })
    })

    afterEach(() => {
      handleClick.mockClear()
      handlePointerOver.mockClear()
      handlePointerOut.mockClear()
      cleanup()
    })

    it('still occludes hovers', () => {
      firePointerEvent('pointermove', { offsetX: 577, offsetY: 480 })
      expect(handlePointerOver).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()
      expect(handleClick).not.toHaveBeenCalled()

      firePointerEvent('pointermove', { offsetX: 0, offsetY: 0 })
      expect(handlePointerOver).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe('over/out handlers on parent node', () => {
    const handlePointerOver = jest.fn()
    const handlePointerOut = jest.fn()

    beforeEach(async () => {
      await act(async () => {
        render(
          <Canvas>
            <group name="parent" onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
              <mesh name="child">
                <boxGeometry args={[2, 2]} />
                <meshBasicMaterial />
              </mesh>
            </group>
          </Canvas>,
        )
      })
    })

    afterEach(() => {
      handlePointerOver.mockClear()
      handlePointerOut.mockClear()
      cleanup()
    })

    it('still calls handlers', () => {
      firePointerEvent('pointermove', { offsetX: 0, offsetY: 0 })
      expect(handlePointerOver).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()

      firePointerEvent('pointermove', { offsetX: 577, offsetY: 480 })
      expect(handlePointerOver).toHaveBeenCalledTimes(1)
      expect(handlePointerOut).not.toHaveBeenCalled()

      firePointerEvent('pointermove', { offsetX: 0, offsetY: 0 })
      expect(handlePointerOver).toHaveBeenCalledTimes(1)
      expect(handlePointerOut).toHaveBeenCalledTimes(1)
    })
  })

  describe('pointer capture', () => {
    const handlePointerMove = jest.fn()
    const captureActive = jest.fn((ev) => {
      ;(ev.target as any).setPointerCapture(ev.pointerId)
    })

    const pointerId = 1234

    afterEach(() => {
      handlePointerMove.mockClear()
      captureActive.mockClear()
    })

    it('delivers events only to the capturing object', async () => {
      const handleMoveFront = jest.fn()
      const handleMoveRear = jest.fn()
      const handleLeave = jest.fn()
      const handleDownRear = jest.fn()

      await act(async () => {
        render(
          <Canvas>
            <mesh onPointerDown={captureActive} onPointerMove={handleMoveFront} onPointerLeave={handleLeave}>
              <boxGeometry args={[1, 1]} />
              <meshBasicMaterial />
            </mesh>
            <mesh onPointerDown={handleDownRear} onPointerMove={handleMoveRear} position-z={-3}>
              <boxGeometry args={[2, 2]} />
              <meshBasicMaterial />
            </mesh>
          </Canvas>,
        )
      })

      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      canvas.setPointerCapture = jest.fn()
      canvas.releasePointerCapture = jest.fn()

      const down = new PointerEvent('pointerdown', { pointerId })
      //@ts-ignore
      down.offsetX = 640
      //@ts-ignore
      down.offsetY = 400

      await act(async () => canvas.dispatchEvent(down))
      expect(captureActive).toHaveBeenCalledTimes(1)
      expect(handleDownRear).not.toHaveBeenCalled()

      expect(canvas.setPointerCapture).toHaveBeenCalledWith(pointerId)
      expect(canvas.releasePointerCapture).not.toHaveBeenCalled()

      /* This will miss the front box but hit the rear one - but pointer capture should still send the event to the front one. */
      const move = new PointerEvent('pointermove', { pointerId })
      //@ts-ignore
      down.offsetX = 577
      //@ts-ignore
      down.offsetY = 480

      await act(async () => canvas.dispatchEvent(move))
      expect(handleLeave).not.toHaveBeenCalled()
      expect(handleMoveFront).toHaveBeenCalled()
      expect(handleMoveRear).not.toHaveBeenCalled()
    })

    it('should release when the capture target is unmounted', async () => {
      /* This component lets us unmount the event-handling object */
      function PointerCaptureTest(props: { hasMesh: boolean }) {
        return (
          <Canvas>
            {props.hasMesh && (
              <mesh onPointerDown={captureActive} onPointerMove={handlePointerMove}>
                <boxGeometry args={[2, 2]} />
                <meshBasicMaterial />
              </mesh>
            )}
          </Canvas>
        )
      }

      let renderResult: RenderResult = undefined!
      await act(async () => {
        renderResult = render(<PointerCaptureTest hasMesh={true} />)
        return renderResult
      })

      const canvas = document.querySelector('canvas') as HTMLCanvasElement

      canvas.setPointerCapture = jest.fn()
      canvas.releasePointerCapture = jest.fn()

      const down = new PointerEvent('pointerdown', { pointerId })
      //@ts-ignore
      down.offsetX = 577
      //@ts-ignore
      down.offsetY = 480

      /* testing-utils/react's fireEvent wraps the event like React does, so it doesn't match how our event handlers are called in production, so we call dispatchEvent directly. */
      await act(async () => canvas.dispatchEvent(down))

      /* This should have captured the DOM pointer */
      expect(captureActive).toHaveBeenCalledTimes(1)
      expect(canvas.setPointerCapture).toHaveBeenCalledWith(pointerId)
      expect(canvas.releasePointerCapture).not.toHaveBeenCalled()

      /* Now remove the mesh */
      await act(async () => renderResult.rerender(<PointerCaptureTest hasMesh={false} />))

      expect(canvas.releasePointerCapture).toHaveBeenCalledWith(pointerId)

      const move = new PointerEvent('pointerdown', { pointerId })
      //@ts-ignore
      move.offsetX = 577
      //@ts-ignore
      move.offsetY = 480

      await act(async () => canvas.dispatchEvent(move))

      /* There should now be no pointer capture */
      expect(handlePointerMove).not.toHaveBeenCalled()
    })

    it('delivers pointerout correctly after a parent was captured and released', async () => {
      const handlePointerOver = jest.fn()
      const handlePointerOut = jest.fn()

      await act(async () =>
        render(
          <Canvas>
            <group onPointerDown={captureActive}>
              <group>
                <mesh onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
                  <boxGeometry args={[2, 2]} />
                  <meshBasicMaterial />
                </mesh>
              </group>
            </group>
          </Canvas>,
        ),
      )

      const canvas = document.querySelector('canvas') as HTMLCanvasElement
      canvas.setPointerCapture = jest.fn()
      canvas.releasePointerCapture = jest.fn()

      // move onto the mesh -> get pointerover

      firePointerEvent('pointermove', { offsetX: 577, offsetY: 480 })
      expect(handlePointerOver).toHaveBeenCalledTimes(1)

      // down -> should be able to capture

      firePointerEvent('pointerdown', { offsetX: 577, offsetY: 480 })
      expect(captureActive).toHaveBeenCalledTimes(1)
      expect(canvas.setPointerCapture).toHaveBeenCalledTimes(1)
      expect(canvas.releasePointerCapture).not.toHaveBeenCalled()
      expect(handlePointerOut).not.toHaveBeenCalled()

      // up -> automatically releases, but the mesh is still hovered

      firePointerEvent('pointerup', { offsetX: 577, offsetY: 480 })
      firePointerEvent('lostpointercapture', { offsetX: 577, offsetY: 480 })
      expect(handlePointerOut).not.toHaveBeenCalled()

      // move away from the mesh -> get pointerout

      firePointerEvent('pointermove', { offsetX: 0, offsetY: 0 })
      expect(handlePointerOut).toHaveBeenCalledTimes(1)
    })
  })
})
