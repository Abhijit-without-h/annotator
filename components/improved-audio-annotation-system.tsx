'use client'

import React, { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ZoomInIcon, ZoomOutIcon, PlusIcon, Trash2Icon, ArrowUpIcon, ArrowDownIcon, PlayIcon, PauseIcon, Loader2, UploadIcon, SaveIcon } from 'lucide-react'

interface Annotation {
  transcription: string
  transliteration: string
  translation: string
  options: string[]
  start: number
  end: number
}

interface TrackData {
  [key: string]: Annotation[]
}

interface Track {
  id: string
  name: string
  height: number
  order: number
}

const available_tone_options = [
  "Determination", "Calmness", "Tiredness", "Boredom", "Relief", "Joy", "Amusement",
  "Anxiety", "Anger", "Disgust", "Sadness", "Pain", "Fear", "Awe", "Surprise",
  "Interest", "Neutral", "Triumph"
]

const GRID_INTERVAL = 1 // Grid interval in seconds
const TRACK_HEIGHT_GRID = 16 // Grid size for track height (in pixels)
const MIN_TRACK_HEIGHT = 32 // Minimum track height (in pixels)

const snapToGrid = (position: number, interval: number) => {
  return Math.round(position / interval) * interval
}

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

export function ImprovedAudioAnnotationSystem() {
  const [timelinePosition, setTimelinePosition] = useState(0)
  const [transcription, setTranscription] = useState('')
  const [transliteration, setTransliteration] = useState('')
  const [translation, setTranslation] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [trackData, setTrackData] = useState<TrackData>({})
  const [zoom, setZoom] = useState(1)
  const [draggingAnnotation, setDraggingAnnotation] = useState<{track: string, index: number} | null>(null)
  const [resizingAnnotation, setResizingAnnotation] = useState<{track: string, index: number} | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<string>('')
  const [tracks, setTracks] = useState<Track[]>([
    { id: 'track-1', name: 'Track A', height: 64, order: 0 },
    { id: 'track-2', name: 'Track B', height: 64, order: 1 },
    { id: 'track-3', name: 'Track C', height: 64, order: 2 },
    { id: 'track-4', name: 'Track D', height: 64, order: 3 },
  ])
  const [selectedAnnotation, setSelectedAnnotation] = useState<{track: string, index: number} | null>(null)
  const [resizingTrack, setResizingTrack] = useState<string | null>(null)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const timelineRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [timelineWidth, setTimelineWidth] = useState(0)
  const [totalDuration, setTotalDuration] = useState(300) // Total duration in seconds
  const [newTrackName, setNewTrackName] = useState<string>('')

  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const [audioId, setAudioId] = useState<string | null>(null)
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [audioError, setAudioError] = useState<string | null>(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmittingAudio, setIsSubmittingAudio] = useState(false);

  useEffect(() => {
    fetchAudio();
  }, []);

  const fetchAudio = async (id: string | null = null) => {
    setIsLoadingAudio(true);
    setAudioError(null);
    try {
      const response = await fetch('http://localhost:5006/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: id ? JSON.stringify({ id }) : null,
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audio');
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const audioBlob = base64ToBlob(data.audio, 'audio/mp3');
      const url = URL.createObjectURL(audioBlob);
      setAudioSrc(url);
      setAudioId(data.id);
      setIsInitialLoad(false);
    } catch (error) {
      console.error('Error fetching audio:', error);
      if (!isInitialLoad) {
        setAudioError('Failed to load audio. Please try again.');
      }
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const handleIdSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const newId = formData.get('audioId') as string
    if (newId) {
      fetchAudio(newId)
    }
  }

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const newContainerWidth = containerRef.current.offsetWidth - 100 // Subtracting track label width
        setContainerWidth(newContainerWidth)
        setTimelineWidth(newContainerWidth * zoom)
      }
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [zoom])

  useEffect(() => {
    // Initialize trackData based on tracks
    const initialTrackData: TrackData = {}
    tracks.forEach(track => {
      initialTrackData[track.name] = []
    })
    setTrackData(initialTrackData)
    setSelectedTrack(tracks[0].id)
  }, [])

  const handleAddAnnotation = () => {
    if (transcription || transliteration || translation) {
      const newAnnotation: Annotation = {
        transcription,
        transliteration,
        translation,
        options: [...selectedOptions],
        start: timelinePosition,
        end: timelinePosition + 5
      }

      setTrackData(prev => {
        const newData = { ...prev };
        const selectedTrackName = tracks.find(t => t.id === selectedTrack)?.name || '';
        if (selectedAnnotation) {
          // Update existing annotation
          newData[selectedTrackName][selectedAnnotation.index] = {
            ...newData[selectedTrackName][selectedAnnotation.index],
            ...newAnnotation
          };
        } else {
          // Add new annotation
          if (!newData[selectedTrackName]) {
            newData[selectedTrackName] = [];
          }
          newData[selectedTrackName].push(newAnnotation);
        }
        return newData;
      });

      resetAnnotationFields();
    }
  }

  const handleAnnotationClick = (track: string, index: number) => {
    const annotation = trackData[track][index]
    setTimelinePosition(annotation.start)
    setTranscription(annotation.transcription)
    setTransliteration(annotation.transliteration)
    setTranslation(annotation.translation)
    setSelectedOptions(annotation.options)
    setSelectedTrack(track)
    setSelectedAnnotation({track, index})
  }

  const handleMouseDown = (e: React.MouseEvent, trackId: string, index: number, action: 'move' | 'resize') => {
    const trackName = tracks.find(t => t.id === trackId)?.name
    if (!trackName || !trackData[trackName] || !trackData[trackName][index]) {
      console.error(`Cannot find annotation at index ${index} in track ${trackName}`)
      return
    }

    if (action === 'move') {
      setDraggingAnnotation({track: trackId, index})
    } else {
      setResizingAnnotation({track: trackId, index})
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!timelineRef.current) return

    const timelineRect = timelineRef.current.getBoundingClientRect()
    const relativeX = e.clientX - timelineRect.left
    const relativeY = e.clientY - timelineRect.top
    let newPosition = (relativeX / timelineWidth) * totalDuration

    // Constrain newPosition within [0, totalDuration]
    newPosition = Math.max(0, Math.min(newPosition, totalDuration))

    // Snap to grid
    newPosition = snapToGrid(newPosition, GRID_INTERVAL)

    if (draggingAnnotation) {
      const targetTrack = tracks.find(track => {
        const trackTop = tracks.slice(0, track.order).reduce((acc, t) => acc + t.height, 0)
        const trackBottom = trackTop + track.height
        return relativeY >= trackTop && relativeY < trackBottom
      })

      if (targetTrack) {
        setTrackData(prev => {
          const newData = { ...prev }
          const sourceTrackId = draggingAnnotation.track
          const targetTrackId = targetTrack.id
          const sourceTrackName = tracks.find(t => t.id === sourceTrackId)?.name || ''
          const targetTrackName = targetTrack.name

          // Ensure the source track exists in the data
          if (!newData[sourceTrackName] || !Array.isArray(newData[sourceTrackName])) {
            console.error(`Source track ${sourceTrackName} not found or is not an array`)
            return prev
          }

          // Get the annotation being moved
          const movedAnnotation = newData[sourceTrackName][draggingAnnotation.index]
          if (!movedAnnotation) {
            console.error(`Annotation at index ${draggingAnnotation.index} not found in ${sourceTrackName}`)
            return prev
          }

          // Remove from source track
          newData[sourceTrackName] = newData[sourceTrackName].filter((_, i) => i !== draggingAnnotation.index)

          // Update the annotation's position
          const duration = movedAnnotation.end - movedAnnotation.start
          movedAnnotation.start = Math.max(0, Math.min(newPosition, totalDuration - duration))
          movedAnnotation.end = movedAnnotation.start + duration

          // Ensure target track exists
          if (!newData[targetTrackName]) {
            newData[targetTrackName] = []
          }

          // Add to target track
          newData[targetTrackName].push(movedAnnotation)

          return newData
        })

        // Update the dragging state with the new track and index
        setDraggingAnnotation({
          track: targetTrack.id,
          index: trackData[targetTrack.name]?.length || 0
        })
      }
    } else if (resizingAnnotation) {
      setTrackData(prev => {
        const newData = { ...prev }
        const trackName = tracks.find(t => t.id === resizingAnnotation.track)?.name

        if (!trackName || !newData[trackName] || !newData[trackName][resizingAnnotation.index]) {
          console.error(`Cannot find annotation to resize for track ${resizingAnnotation.track} at index ${resizingAnnotation.index}`)
          return prev
        }

        const annotation = { ...newData[trackName][resizingAnnotation.index] }
        annotation.end = Math.max(annotation.start + GRID_INTERVAL, Math.min(newPosition, totalDuration))

        // Ensure annotation stays within the track boundaries
        annotation.end = Math.min(totalDuration, annotation.end)

        newData[trackName][resizingAnnotation.index] = annotation
        return newData
      })
    } else if (resizingTrack) {
      const trackIndex = tracks.findIndex(t => t.id === resizingTrack)
      const totalHeight = tracks.reduce((acc, t) => acc + t.height, 0)
      const mouseY = e.clientY - timelineRect.top
      const trackTop = tracks.slice(0, trackIndex).reduce((acc, t) => acc + t.height, 0)
      const newHeight = Math.max(MIN_TRACK_HEIGHT, snapToGrid(mouseY - trackTop, TRACK_HEIGHT_GRID))
      
      setTracks(prev => prev.map((track, index) => 
        index === trackIndex ? { ...track, height: newHeight } : track
      ))
    }
  }

  const handleMouseUp = () => {
    if (draggingAnnotation) {
      // Finalize the annotation position
      setTrackData(prev => {
        const newData = { ...prev }
        const trackName = tracks.find(t => t.id === draggingAnnotation.track)?.name
        if (trackName && newData[trackName] && newData[trackName][draggingAnnotation.index]) {
          const annotation = newData[trackName][draggingAnnotation.index]
          annotation.start = snapToGrid(annotation.start, GRID_INTERVAL)
          annotation.end = snapToGrid(annotation.end, GRID_INTERVAL)
        }
        return newData
      })
    }
    setDraggingAnnotation(null)
    setResizingAnnotation(null)
    setResizingTrack(null)
  }

  const handleAddTrack = () => {
    const newTrackId = `track-${tracks.length + 1}`
    const newTrack = { id: newTrackId, name: `Track ${tracks.length + 1}`, height: MIN_TRACK_HEIGHT, order: tracks.length }
    setTracks(prev => [...prev, newTrack])
    setTrackData(prev => ({ ...prev, [newTrack.name]: [] }))
  }

  const resetAnnotationFields = () => {
    setTranscription('')
    setTransliteration('')
    setTranslation('')
    setSelectedOptions([])
    setSelectedAnnotation(null)
  }

  const handleDeleteAnnotation = () => {
    if (selectedAnnotation) {
      setTrackData(prev => ({
        ...prev,
        [selectedAnnotation.track]: prev[selectedAnnotation.track].filter((_, i) => i !== selectedAnnotation.index)
      }))
      resetAnnotationFields()
    }
  }

  const handleZoom = (direction: 'in' | 'out') => {
    setZoom(prev => {
      const newZoom = direction === 'in' ? prev * 1.2 : prev / 1.2
      return Math.max(0.1, Math.min(10, newZoom))
    })
  }

  const timeToPixels = (time: number) => (time / totalDuration) * timelineWidth

  const handleTrackNameEdit = (id: string, newName: string) => {
    setTracks(prev => prev.map(track => 
      track.id === id ? { ...track, name: newName } : track
    ))
    setTrackData(prev => {
      const newData = { ...prev }
      const oldName = tracks.find(t => t.id === id)?.name
      if (oldName && oldName in newData) {
        newData[newName] = newData[oldName]
        delete newData[oldName]
      }
      return newData
    })
  }

  const handleTrackNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewTrackName(e.target.value)
  }

  const confirmTrackNameEdit = (id: string) => {
    handleTrackNameEdit(id, newTrackName)
    setEditingTrackId(null)
  }

  const cancelTrackNameEdit = () => {
    setEditingTrackId(null)
    setNewTrackName('')
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') {
      handleTrackNameEdit(id, (e.target as HTMLInputElement).value)
    } else if (e.key === 'Escape') {
      setEditingTrackId(null)
    }
  }

  const handleDeleteTrack = (id: string) => {
    setTracks(prev => prev.filter(track => track.id !== id))
    setTrackData(prev => {
      const { [id]: deletedTrack, ...rest } = prev
      return rest
    })
  }

  const handleExportJson = () => {
    const orderedTrackData: TrackData = {}
    
    tracks
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach(track => {
        orderedTrackData[track.name] = trackData[track.name] || []
      })

    const dataStr = JSON.stringify(orderedTrackData, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
    const exportFileDefaultName = 'annotation_data.json'

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const moveTrack = (trackId: string, direction: 'up' | 'down') => {
    setTracks(prevTracks => {
      const index = prevTracks.findIndex(t => t.id === trackId);
      if ((direction === 'up' && index > 0) || (direction === 'down' && index < prevTracks.length - 1)) {
        const newTracks = [...prevTracks];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newTracks[index], newTracks[swapIndex]] = [newTracks[swapIndex], newTracks[index]];
        return newTracks.map((track, i) => ({ ...track, order: i }));
      }
      return prevTracks;
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsSubmittingAudio(true);
      const formData = new FormData();
      formData.append('audio', file);
      
      try {
        const response = await fetch('http://localhost:5006/submit-audio', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        setAudioId(data.id);
        fetchAudio(data.id);
      } catch (error) {
        console.error('Error submitting audio:', error);
      } finally {
        setIsSubmittingAudio(false);
      }
    }
  };

  const handleSaveJson = async () => {
    if (audioId) {
      try {
        const response = await fetch('http://localhost:5006/save-json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: audioId,
            json_data: JSON.stringify(trackData),
          }),
        });
        const data = await response.json();
        console.log('JSON saved:', data);
      } catch (error) {
        console.error('Error saving JSON:', error);
      }
    }
  };

  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setTimelinePosition(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setTotalDuration(audioRef.current.duration)
    }
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.addEventListener('timeupdate', handleTimeUpdate)
      audioRef.current.addEventListener('loadedmetadata', handleLoadedMetadata)
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('timeupdate', handleTimeUpdate)
        audioRef.current.removeEventListener('loadedmetadata', handleLoadedMetadata)
      }
    }
  }, [audioSrc])

  useEffect(() => {
    document.addEventListener('mousemove', (e: MouseEvent) => handleMouseMove(e as unknown as React.MouseEvent))
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', (e: MouseEvent) => handleMouseMove(e as unknown as React.MouseEvent))
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  return (
    <div className="p-4 max-w-4xl mx-auto" ref={containerRef}>
      <div className="mb-4 p-4 border rounded-lg bg-gray-100">
        <form onSubmit={handleIdSubmit} className="flex items-center space-x-2 mb-4">
          <Input 
            type="text" 
            name="audioId" 
            placeholder="Enter audio ID or leave blank for random" 
            defaultValue={audioId || ''}
          />
          <Button type="submit">Load Audio</Button>
        </form>
        
        {isLoadingAudio && (
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading audio...</span>
          </div>
        )}
        
        {audioError && !isInitialLoad && (
          <div className="text-red-500">{audioError}</div>
        )}
        
        {audioSrc && !isLoadingAudio && (
          <div className="w-full">
            <audio ref={audioRef} src={audioSrc} />
            <div className="flex items-center justify-between">
              <Button onClick={togglePlayPause}>
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <Slider
                value={[timelinePosition]}
                onValueChange={([value]) => {
                  setTimelinePosition(value)
                  if (audioRef.current) {
                    audioRef.current.currentTime = value
                  }
                }}
                max={totalDuration}
                step={0.01}
                className="w-full mx-4"
              />
              <span>{formatTime(timelinePosition)} / {formatTime(totalDuration)}</span>
            </div>
          </div>
        )}

        {audioId && (
          <div className="mt-4">
            <h3 className="font-bold">Current Audio ID: {audioId}</h3>
          </div>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="audio/*"
          style={{ display: 'none' }}
        />
        <div className="flex items-center space-x-2 mb-4">
          <Button onClick={() => fileInputRef.current?.click()} disabled={isSubmittingAudio}>
            <UploadIcon className="mr-2 h-4 w-4" />
            Submit Audio
          </Button>
          <Button onClick={handleSaveJson} disabled={!audioId}>
            <SaveIcon className="mr-2 h-4 w-4" />
            Save JSON
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center space-x-2">
              <Button onClick={() => handleZoom('out')} size="icon">
                <ZoomOutIcon className="h-4 w-4" />
              </Button>
              <Button onClick={() => handleZoom('in')} size="icon">
                <ZoomInIcon className="h-4 w-4" />
              </Button>
              <span>Zoom: {zoom.toFixed(2)}x</span>
            </div>
            <span>Timeline Position: {timelinePosition.toFixed(2)}s</span>
          </div>
          

          <div className="flex">
            <div className="w-24 flex-shrink-0">
              {tracks
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((track, index) => (
                  <div
                    key={track.id}
                    className={`border-b relative`}
                    style={{
                      height: `${track.height}px`,
                    }}
                  >
                    <div className="h-full bg-gray-200 p-1 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          {editingTrackId === track.id ? (
                            <Input
                              value={newTrackName}
                              onChange={handleTrackNameChange}
                              onBlur={cancelTrackNameEdit}
                              onKeyDown={(e) => handleKeyPress(e, track.id)}
                              className="w-16 h-6 text-xs"
                              autoFocus
                            />
                          ) : (
                            <span
                              className="font-bold text-sm cursor-pointer"
                              onDoubleClick={() => {
                                setEditingTrackId(track.id)
                                setNewTrackName(track.name)
                              }}
                            >
                              {track.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end space-x-1 mt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveTrack(track.id, 'up')}
                          disabled={index === 0}
                          className="h-6 w-6 p-0"
                        >
                          <ArrowUpIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveTrack(track.id, 'down')}
                          disabled={index === tracks.length - 1}
                          className="h-6 w-6 p-0"
                        >
                          <ArrowDownIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTrack(track.id)}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2Icon className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
            <div className="overflow-x-auto flex-grow">
              <div 
                ref={timelineRef}
                className="relative border rounded-lg overflow-hidden"
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ width: `${timelineWidth}px`, height: `${tracks.reduce((acc, t) => acc + t.height, 0)}px` }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    resetAnnotationFields()
                  }
                }}
              >
                {tracks
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((track) => (
                    <div 
                      key={track.id} 
                      className={`absolute w-full border-b`}
                      style={{ 
                        top: `${tracks.slice(0, track.order).reduce((acc, t) => acc + t.height, 0)}px`, 
                        height: `${track.height}px`,
                      }}
                    >
                      {trackData[track.name]?.map((annotation, index) => (
                        <div
                          key={index}
                          className={`annotation absolute top-0 h-full bg-blue-200 border border-blue-400 rounded cursor-move ${
                            draggingAnnotation?.track === track.id && draggingAnnotation?.index === index ? 'opacity-50' : ''
                          }`}
                          style={{ 
                            left: `${timeToPixels(annotation.start)}px`, 
                            width: `${timeToPixels(annotation.end - annotation.start)}px`,
                          }}
                          onClick={() => handleAnnotationClick(track.id, index)}
                          onMouseDown={(e) => handleMouseDown(e, track.id, index, 'move')}
                        >
                          <div 
                            className="absolute right-0 top-0 bottom-0 w-2 bg-blue-600 cursor-ew-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation()
                              handleMouseDown(e, track.id, index, 'resize')
                            }}
                          />
                          <div className="p-1 text-xs truncate">{annotation.transcription}</div>
                        </div>
                      ))}
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-2 bg-gray-400 cursor-ns-resize"
                        onMouseDown={() => setResizingTrack(track.id)}
                      />
                    </div>
                  ))
                }
                <div
                  className="absolute top-0 w-0.5 h-full bg-red-500 pointer-events-none"
                  style={{ left: `${timeToPixels(timelinePosition)}px` }}
                />
              </div>
            </div>
          </div>
          <Slider
            value={[timelinePosition]}
            onValueChange={([value]) => setTimelinePosition(value)}
            max={totalDuration}
            step={0.01}
            className="w-full mt-2"
          />
          <Button onClick={handleAddTrack} className="mt-2">
            <PlusIcon className="mr-2 h-4 w-4" /> Add Track
          </Button>
        </div>

        <div>
          <Select value={selectedTrack} onValueChange={setSelectedTrack}>
            <SelectTrigger className="w-full mb-2">
              <SelectValue placeholder="Select Track" />
            </SelectTrigger>
            <SelectContent>
              {tracks.map(track => (
                <SelectItem key={track.id} value={track.id}>{track.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={transcription}
            onChange={(e) => setTranscription(e.target.value)}
            placeholder="Transcription"
            className="mb-2"
          />
          <Input
            value={transliteration}
            onChange={(e) => setTransliteration(e.target.value)}
            placeholder="Transliteration"
            className="mb-2"
          />
          <Input
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="Translation"
            className="mb-2"
          />

          <div className="grid grid-cols-2 gap-2 mb-2">
            {available_tone_options.map(option => (
              <Button
                key={option}
                variant={selectedOptions.includes(option) ? "default" : "outline"}
                onClick={() => setSelectedOptions(prev =>
                  prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option]
                )}
                className="w-full"
              >
                {option}
              </Button>
            ))}
          </div>

          <Button onClick={handleAddAnnotation} className="w-full mb-2">
            {selectedAnnotation ? 'Update Annotation' : 'Add Annotation'}
          </Button>

          {selectedAnnotation && (
            <div className="flex gap-2">
              <Button onClick={resetAnnotationFields} variant="outline" className="flex-grow">
                Clear Selection
              </Button>
              <Button onClick={handleDeleteAnnotation} variant="destructive">
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 p-4 border rounded-lg">
        <h2 className="text-xl font-bold mb-4">DEBUG</h2>
        <div className="flex gap-4 mb-4">
          <Button onClick={handleExportJson}>
            Export Full JSON
          </Button>
        </div>
        <div className="p-4 bg-gray-100 rounded-lg overflow-auto max-h-96">
          <h3 className="font-bold mb-2">Full Internal JSON:</h3>
          <pre className="text-xs whitespace-pre-wrap">
            {JSON.stringify(trackData, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  )
}

// Helper function to format time in MM:SS
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}