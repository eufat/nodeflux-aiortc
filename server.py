import argparse
import asyncio
import json
import logging
import os
import wave

import cv2
from aiohttp import web

from aiortc import (RTCPeerConnection, RTCSessionDescription, VideoFrame,
                    VideoStreamTrack)
from aiortc.contrib.media import (AudioFileTrack, VideoFileTrack,
                                  frame_from_bgr, frame_from_gray,
                                  frame_to_bgr)

ROOT = os.path.dirname(__file__)

rtsp_path = "rtsp://184.72.239.149/vod/mp4:BigBuckBunny_175k.mov"


async def consume_video(track, local_video):
    """
    Drain incoming video, and echo it back.
    """
    last_size = None

    while True:
        frame = await track.recv()

        # print frame size
        frame_size = (frame.width, frame.height)
        if frame_size != last_size:
            print('Received frame size', frame_size)
            last_size = frame_size

        # we are only interested in the latest frame
        if local_video.received.full():
            await local_video.received.get()

        await local_video.received.put(frame)


async def index(request):
    content = open(os.path.join(ROOT, 'index.html'), 'r').read()
    return web.Response(content_type='text/html', text=content)


async def javascript(request):
    content = open(os.path.join(ROOT, 'client.js'), 'r').read()
    return web.Response(content_type='application/javascript', text=content)


async def offer(request):
    params = await request.json()
    offer = RTCSessionDescription(sdp=params['sdp'], type=params['type'])

    local_video = VideoFileTrack(rtsp_path)

    pc = RTCPeerConnection()
    pc._consumers = []
    pcs.append(pc)

    @pc.on('datachannel')
    def on_datachannel(channel):
        @channel.on('message')
        def on_message(message):
            channel.send('pong')

    @pc.on('track')
    def on_track(track):
        if track.kind == 'video':
            pc.addTrack(local_video)
            pc._consumers.append(
                asyncio.ensure_future(consume_video(track, local_video)))

    await pc.setRemoteDescription(offer)
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    return web.Response(
        content_type='application/json',
        text=json.dumps({
            'sdp': pc.localDescription.sdp,
            'type': pc.localDescription.type
        }))


pcs = []


async def on_shutdown(app):
    # stop audio / video consumers
    for pc in pcs:
        for c in pc._consumers:
            c.cancel()

    # close peer connections
    coros = [pc.close() for pc in pcs]
    await asyncio.gather(*coros)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='WebRTC audio / video / data-channels demo')
    parser.add_argument(
        '--port',
        type=int,
        default=8080,
        help='Port for HTTP server (default: 8080)')
    parser.add_argument('--verbose', '-v', action='count')
    args = parser.parse_args()

    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)

    app = web.Application()
    app.on_shutdown.append(on_shutdown)
    app.router.add_get('/', index)
    app.router.add_get('/client.js', javascript)
    app.router.add_post('/offer', offer)
    web.run_app(app, port=args.port, host='127.0.0.1')
