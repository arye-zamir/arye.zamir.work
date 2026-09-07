import { storage } from '../../services/browser'
import { STORAGE_KEY, STORAGE_TYPE } from '../../services/storage'
import { theme } from '../../services/theme'
import { ARCHIFY_CONTRACT } from './archify-contract'
import { readThemeOverride } from './initial-state'
const mountArchifyRuntime = (scope) => {
  const {
    browser,
    browserNavigator,
    cancelAnimationFrame,
    clearTimeout,
    document,
    history,
    location,
    MutationObserver,
    onDispose,
    requestAnimationFrame,
    ResizeObserver,
    setTimeout,
    URL,
  } = scope
  const Archify = {}
  const ARCHIFY_FAILURE_PREFIX = 'Archify viewer fallback'
  function reportArchifyFailure(error) {
    console.warn(ARCHIFY_FAILURE_PREFIX, error)
  }
  function isMissing(value) {
    return value === null || value === undefined
  }
  const archifyI18nData = (function () {
    const node = document.getElementById(ARCHIFY_CONTRACT.element.i18nData)
    try {
      return JSON.parse(node ? node.textContent : '{}')
    } catch (_) {
      reportArchifyFailure(_)
      return { locale: 'en', messages: {} }
    }
  })()
  Archify.locale = archifyI18nData.locale || 'en'
  function viewerText(key, values) {
    const messages = archifyI18nData.messages || {}
    const template = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, function (match, name) {
      return values && Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
    })
  }
  function viewerCount(key, count, values) {
    const suffix = Number(count) === 1 ? '.one' : '.other'
    const payload = Object.assign({}, values || {}, { count })
    return viewerText(key + suffix, payload)
  }
  function viewerKindLabel(value) {
    const normalized = String(value || 'node').toLowerCase()
    const knownKey = 'viewer.kind.' + normalized
    const known = viewerText(knownKey)
    if (known !== knownKey) return known
    return normalized
      .replace(/messagebus/gi, 'message bus')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, function (letter) {
        return letter.toUpperCase()
      })
  }
  function hasDrawableGeometry(element) {
    if (!element) return false
    const geometries = /^(path|line|polyline)$/i.test(element.tagName)
      ? [element]
      : Array.prototype.slice.call(element.querySelectorAll('path, line, polyline'))
    return geometries.some(function (geometry) {
      const source =
        geometry.tagName.toLowerCase() === 'path'
          ? geometry.getAttribute('d')
          : geometry.tagName.toLowerCase() === 'polyline'
            ? geometry.getAttribute('points')
            : [
                geometry.getAttribute('x1'),
                geometry.getAttribute('y1'),
                geometry.getAttribute('x2'),
                geometry.getAttribute('y2'),
              ].join(' ')
      if (
        !source ||
        /(?:^|[^a-z])(?:nan|infinity)(?:[^a-z]|$)/i.test(source) ||
        typeof geometry.getTotalLength !== 'function'
      )
        return false
      try {
        const length = Number(geometry.getTotalLength())
        return Number.isFinite(length) && length > 0
      } catch (_) {
        reportArchifyFailure(_)
        return false
      }
    })
  }
  Archify.theme = (function () {
    const UI = { attribute: 'data-theme', preference: 'data-theme-preference' }
    const html = document.documentElement
    let override = readThemeOverride()
    const apply = () => {
      const preference = override ?? theme.getPreference()
      html.setAttribute(UI.attribute, theme.resolve(preference))
      html.setAttribute(UI.preference, preference)
    }
    const toggle = () => {
      override = null
      theme.cycle()
      apply()
    }
    let initial = true
    onDispose(
      theme.subscribe(() => {
        if (!initial) override = null
        initial = false
        apply()
      }),
    )
    return { toggle }
  })()
  Archify.motionGovernor = (function () {
    const MOTION_KEY = STORAGE_KEY.motion
    const html = document.documentElement
    const svg = document.querySelector('.diagram-container svg')
    const btn = document.getElementById('btn-motion')
    const label = document.getElementById('motion-label')
    const motionQuery = browser.matchMedia ? browser.matchMedia('(prefers-reduced-motion: reduce)') : null
    const capable = !!(svg && svg.getAttribute('data-animation') === 'trace')
    let readerPaused = false
    const suspensions = Object.create(null)
    let explicitOwner = ''
    let owner = ''
    let ownerToken = 0
    let ownerCleanup = null
    let lastEffectivePaused = null
    let ambientStarted = false
    let ambientPending = new Set()
    function detachAmbientBoundary() {
      if (!svg) return
      svg.removeEventListener('animationend', onAmbientBoundary, true)
      svg.removeEventListener('animationcancel', onAmbientBoundary, true)
    }
    function settleAmbient(reason) {
      if (!capable) return false
      ambientStarted = true
      ambientPending.clear()
      detachAmbientBoundary()
      html.setAttribute('data-ambient-motion', 'settled')
      html.setAttribute('data-ambient-settle-reason', reason || 'complete')
      return true
    }
    function onAmbientBoundary(event) {
      if (!ambientPending.has(event.target)) return
      ambientPending.delete(event.target)
      if (!ambientPending.size) settleAmbient('complete')
    }
    function startAmbient() {
      if (ambientStarted || !capable) return false
      ambientStarted = true
      ambientPending = new Set(
        Array.prototype.slice.call(svg.querySelectorAll('[data-animate="edge"], [data-animate="node"]')),
      )
      if (!ambientPending.size) return settleAmbient('empty')
      svg.addEventListener('animationend', onAmbientBoundary, true)
      svg.addEventListener('animationcancel', onAmbientBoundary, true)
      html.setAttribute('data-ambient-motion', 'running')
      html.removeAttribute('data-ambient-settle-reason')
      return true
    }
    const readStored = () => storage.get(MOTION_KEY)
    const writeStored = () => {
      const paused = 'still'
      if (readerPaused) storage.set(MOTION_KEY, paused, STORAGE_TYPE.str)
      else storage.remove(MOTION_KEY)
    }
    function reducedMotion() {
      return !!(motionQuery && motionQuery.matches)
    }
    function hasSuspension() {
      return Object.keys(suspensions).length > 0
    }
    function effectivePaused() {
      return readerPaused || reducedMotion() || hasSuspension()
    }
    function ownerLabel(value) {
      if (value === 'story') return viewerText('viewer.owner.story')
      if (value === 'chapter') return viewerText('viewer.owner.chapter')
      if (value === 'chapter-preview') return viewerText('viewer.owner.chapterPreview')
      if (value === 'handoff') return viewerText('viewer.owner.handoff')
      if (value === 'route') return viewerText('viewer.owner.route')
      if (value === 'lens') return viewerText('viewer.owner.lens')
      if (value === 'relationship') return viewerText('viewer.owner.relationship')
      if (value === 'intent') return viewerText('viewer.owner.intent')
      if (value === 'focus') return viewerText('viewer.owner.focus')
      if (value === 'legend') return viewerText('viewer.owner.legend')
      return viewerText('viewer.owner.reader')
    }
    function render() {
      if (!capable) return
      const systemPaused = reducedMotion()
      const paused = effectivePaused()
      html.setAttribute('data-motion', paused ? 'still' : 'live')
      if (
        paused ||
        owner ||
        html.hasAttribute('data-embed') ||
        html.hasAttribute('data-share-playback') ||
        html.hasAttribute('data-document-hidden')
      ) {
        settleAmbient('suppressed')
      } else if (!ambientStarted) {
        startAmbient()
      }
      btn.setAttribute('aria-pressed', paused ? 'false' : 'true')
      btn.disabled = systemPaused
      label.textContent = viewerText(paused ? 'viewer.motion.still' : 'viewer.motion.live')
      if (paused && lastEffectivePaused !== true && Archify.guidedViews && Archify.guidedViews.isPlaying()) {
        Archify.guidedViews.pause()
      }
      if (paused && lastEffectivePaused !== true && Archify.guidedViews && Archify.guidedViews.settleHandoff) {
        Archify.guidedViews.settleHandoff(systemPaused ? 'reduced-motion' : hasSuspension() ? 'hidden' : 'still')
      }
      if (
        paused &&
        lastEffectivePaused !== true &&
        Archify.routeProbe &&
        Archify.routeProbe.isJourneyPlaying &&
        Archify.routeProbe.isJourneyPlaying()
      ) {
        Archify.routeProbe.pauseJourney({
          preserveElapsed: true,
          reason: systemPaused ? 'reduced-motion' : hasSuspension() ? 'hidden' : 'still',
        })
      }
      lastEffectivePaused = paused
      if (Archify.routeProbe && typeof Archify.routeProbe.syncMotion === 'function') Archify.routeProbe.syncMotion()
      if (systemPaused) {
        btn.setAttribute('aria-label', viewerText('viewer.motion.reduced'))
        btn.title = viewerText('viewer.motion.reduced')
      } else if (hasSuspension()) {
        btn.setAttribute('aria-label', viewerText('viewer.motion.hidden'))
        btn.title = viewerText('viewer.motion.hidden')
      } else if (paused) {
        btn.setAttribute('aria-label', viewerText('viewer.motion.resume'))
        btn.title = viewerText('viewer.motion.resume')
      } else if (owner) {
        btn.setAttribute('aria-label', viewerText('viewer.motion.yielding', { owner: ownerLabel(owner) }))
        btn.title = viewerText('viewer.motion.yielding.title', { owner: ownerLabel(owner) })
      } else {
        btn.setAttribute('aria-label', viewerText('viewer.motion.pause'))
        btn.title = viewerText('viewer.motion.pause')
      }
    }
    function setPaused(next, options) {
      options = options || {}
      readerPaused = !!next
      if (options.persist !== false) writeStored()
      render()
      return readerPaused
    }
    function publishOwner() {
      owner = explicitOwner || deriveOwner()
      if (owner) html.setAttribute('data-motion-owner', owner)
      else html.removeAttribute('data-motion-owner')
      render()
      return owner
    }
    function deriveOwner() {
      if (!svg) return ''
      if (svg.hasAttribute('data-story-playing') || svg.hasAttribute('data-story-follow')) return 'story'
      if (svg.hasAttribute('data-story-active')) return 'chapter'
      if (svg.hasAttribute('data-route-picking') || svg.hasAttribute('data-route-active')) return 'route'
      if (svg.hasAttribute('data-lens-active')) return 'lens'
      if (svg.hasAttribute('data-relationship-preview-active')) return 'relationship'
      if (svg.hasAttribute('data-intent-trace-active')) return 'intent'
      if (svg.hasAttribute('data-focus-active')) return 'focus'
      if (svg.hasAttribute('data-legend-preview-active')) return 'legend'
      return ''
    }
    function clearClaim(preempted) {
      const cleanup = ownerCleanup
      ownerCleanup = null
      explicitOwner = ''
      if (preempted && cleanup) {
        try {
          cleanup()
        } catch (_) {
          reportArchifyFailure(_)
        }
      }
    }
    function claim(next, cleanup) {
      if (!capable || !next) return 0
      clearClaim(true)
      ownerToken += 1
      explicitOwner = next
      ownerCleanup = typeof cleanup === 'function' ? cleanup : null
      publishOwner()
      return ownerToken
    }
    function release(token) {
      if (!capable || token !== ownerToken || !explicitOwner) return false
      clearClaim(false)
      ownerToken += 1
      publishOwner()
      return true
    }
    function suspend(reason) {
      const key = String(reason || 'runtime')
      let active = true
      suspensions[key] = (suspensions[key] || 0) + 1
      render()
      return function () {
        if (!active) return false
        active = false
        if (suspensions[key] > 1) suspensions[key] -= 1
        else delete suspensions[key]
        render()
        return true
      }
    }
    function syncVisibility() {
      if (document.hidden) {
        suspensions.visibility = true
        html.setAttribute('data-document-hidden', 'true')
      } else {
        delete suspensions.visibility
        html.removeAttribute('data-document-hidden')
      }
      render()
    }
    if (!capable) {
      btn.hidden = true
      html.removeAttribute('data-motion-capable')
      html.removeAttribute('data-motion')
      html.removeAttribute('data-motion-owner')
      html.removeAttribute('data-ambient-motion')
      html.removeAttribute('data-ambient-settle-reason')
      return {
        capable: false,
        claim: function () {
          return 0
        },
        isPaused: function () {
          return true
        },
        mode: function () {
          return 'still'
        },
        owner: function () {
          return ''
        },
        pause: function () {
          return false
        },
        release: function () {
          return false
        },
        resume: function () {
          return false
        },
        setMode: function () {
          return 'still'
        },
        suspend: function () {
          return function () {
            return false
          }
        },
        toggle: function () {
          return false
        },
      }
    }
    html.setAttribute('data-motion-capable', 'true')
    btn.hidden = false
    readerPaused = readStored() === 'still'
    btn.addEventListener('click', function () {
      setPaused(!readerPaused)
    })
    if (motionQuery) {
      if (typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', render)
      else if (typeof motionQuery.addListener === 'function') motionQuery.addListener(render)
    }
    document.addEventListener('visibilitychange', syncVisibility)
    if (
      document.documentElement.getAttribute('data-embed') !== 'true' &&
      typeof MutationObserver !== 'undefined' &&
      typeof Node !== 'undefined' &&
      svg instanceof Node
    ) {
      const ownerObserver = new MutationObserver(function () {
        publishOwner()
      })
      ownerObserver.observe(svg, {
        attributeFilter: [
          'data-story-playing',
          'data-story-follow',
          'data-story-active',
          'data-route-picking',
          'data-route-active',
          'data-lens-active',
          'data-relationship-preview-active',
          'data-intent-trace-active',
          'data-focus-active',
          'data-legend-preview-active',
        ],
        attributes: true,
      })
    }
    syncVisibility()
    publishOwner()
    render()
    return {
      capable: true,
      claim,
      isPaused: effectivePaused,
      mode: function () {
        return effectivePaused() ? 'still' : 'live'
      },
      owner: function () {
        return owner
      },
      pause: function () {
        return setPaused(true)
      },
      release,
      resume: function () {
        return setPaused(false)
      },
      setMode: function (next, options) {
        setPaused(next === 'still', options)
        return effectivePaused() ? 'still' : 'live'
      },
      suspend,
      toggle: function () {
        return setPaused(!readerPaused)
      },
    }
  })()
  Archify.sourceEvidence = (function () {
    const element = document.getElementById('archify-source-evidence-data')
    let payload = null
    const svgNamespace = 'http://www.w3.org/2000/svg'
    if (element) {
      try {
        const parsed = JSON.parse(element.textContent || 'null')
        if (parsed && parsed.verified === true && parsed.repository && parsed.nodes) payload = parsed
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function installBeacons() {
      if (!payload) return 0
      const svg = document.querySelector('.diagram-container svg')
      if (!svg) return 0
      let installed = 0
      Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
        const id = node.getAttribute('data-node-id')
        const sources = payload.nodes[id]
        if (!Array.isArray(sources) || !sources.length || node.querySelector('[data-source-evidence-beacon]')) return
        const shape = node.querySelector('[data-animate="node"]') || node.querySelector('[class*="c-"]')
        let box
        try {
          box = (shape || node).getBBox()
        } catch (_) {
          reportArchifyFailure(_)
          return
        }
        if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y) || !Number.isFinite(box.width) || box.width < 36)
          return
        const count = sources.length
        const label = viewerCount('viewer.passport.beacon', count)
        const beacon = document.createElementNS(svgNamespace, 'g')
        beacon.classList.add('source-evidence-beacon')
        beacon.setAttribute('data-source-evidence-beacon', '')
        beacon.setAttribute('aria-hidden', 'true')
        const brandOffset = node.hasAttribute('data-node-brand') ? 24 : 0
        beacon.setAttribute(
          'transform',
          'translate(' + (box.x + box.width - 35 - brandOffset) + ' ' + (box.y + 5) + ')',
        )
        const title = document.createElementNS(svgNamespace, 'title')
        title.textContent = label
        const plate = document.createElementNS(svgNamespace, 'rect')
        plate.setAttribute('width', '30')
        plate.setAttribute('height', '12')
        plate.setAttribute('rx', '6')
        const text = document.createElementNS(svgNamespace, 'text')
        text.setAttribute('x', '15')
        text.setAttribute('y', '8.25')
        text.textContent = viewerText('viewer.passport.sourceMarker') + ' ' + count
        beacon.appendChild(title)
        beacon.appendChild(plate)
        beacon.appendChild(text)
        node.appendChild(beacon)
        const originalLabel = node.getAttribute('aria-label') || ''
        node.setAttribute('data-source-evidence-count', String(count))
        node.setAttribute('data-source-evidence-original-label', originalLabel)
        node.setAttribute(
          'aria-label',
          (originalLabel ? originalLabel + ', ' : '') + viewerCount('viewer.passport.sourceCount', count),
        )
        installed += 1
      })
      return installed
    }
    return {
      available: function () {
        return Boolean(payload)
      },
      installBeacons,
      node: function (id) {
        const sources = payload && payload.nodes ? payload.nodes[id] : null
        return Array.isArray(sources) ? sources.slice() : []
      },
      repository: function () {
        return payload ? payload.repository : null
      },
    }
  })()
  Archify.sourceEvidence.installBeacons()
  Archify.focus = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector('svg')
    const chip = document.getElementById('focus-chip')
    const label = document.getElementById('focus-label')
    const detail = document.getElementById('focus-detail')
    const kind = document.getElementById('focus-kind')
    const context = document.getElementById('focus-context')
    const tag = document.getElementById('focus-tag')
    const semanticId = document.getElementById('focus-id')
    const evidence = document.getElementById('focus-evidence')
    const repositoryLink = document.getElementById('focus-repository')
    const evidenceLinks = document.getElementById('focus-evidence-links')
    const summary = document.getElementById('focus-summary')
    const reachSection = document.getElementById('focus-reach')
    const reachStatus = document.getElementById('focus-reach-status')
    const upstreamBtn = document.getElementById('btn-reach-upstream')
    const downstreamBtn = document.getElementById('btn-reach-downstream')
    const upstreamCount = document.getElementById('focus-reach-upstream-count')
    const downstreamCount = document.getElementById('focus-reach-downstream-count')
    const relationshipList = document.getElementById('relationship-lens-list')
    const copyBtn = document.getElementById('btn-focus-copy')
    const relationsBtn = document.getElementById('btn-focus-relations')
    const clearBtn = document.getElementById('btn-focus-clear')
    let activeIds = []
    let hoveredRelationship = null
    let focusedRelationship = null
    let pinnedRelationship = null
    let pinnedRelationshipKey = null
    let activeRelationshipPreview = null
    let relationshipHitOverlay = null
    const relationshipHitTargets = []
    let directPreviewTimer = null
    let reachabilityMode = null
    let activeReachability = null
    const svgNamespace = 'http://www.w3.org/2000/svg'
    const reducedMotionQuery = browser.matchMedia ? browser.matchMedia('(prefers-reduced-motion: reduce)') : null
    const finePointerQuery = browser.matchMedia ? browser.matchMedia('(hover: hover) and (pointer: fine)') : null
    function nodes() {
      return Array.prototype.slice.call(svg.querySelectorAll('[data-node-id]'))
    }
    function edges() {
      return Array.prototype.slice.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'))
    }
    function nodeLabel(node, fallback) {
      return (
        node.getAttribute('data-node-label') || (node.getAttribute('aria-label') || fallback).replace(/^Focus\s+/, '')
      )
    }
    function reachabilityRelationships() {
      const seen = Object.create(null)
      const relationships = []
      edges().forEach(function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        const key =
          edge.getAttribute('data-edge-key') || from + '\0' + to + '\0' + (edge.getAttribute('data-edge-label') || '')
        if (!from || !to || seen[key]) return
        seen[key] = true
        relationships.push({ from, key, to })
      })
      return relationships
    }
    function computeReachability(originId, direction, relationships) {
      if (
        typeof originId !== 'string' ||
        !originId ||
        (direction !== 'upstream' && direction !== 'downstream') ||
        !Array.isArray(relationships)
      )
        return null
      const records = []
      const seenKeys = Object.create(null)
      relationships.forEach(function (relationship, index) {
        if (
          !relationship ||
          typeof relationship.from !== 'string' ||
          !relationship.from ||
          typeof relationship.to !== 'string' ||
          !relationship.to
        )
          return
        const key = typeof relationship.key === 'string' && relationship.key ? relationship.key : String(index)
        if (seenKeys[key]) return
        seenKeys[key] = true
        records.push({ from: relationship.from, key, to: relationship.to })
      })
      const depths = Object.create(null)
      const order = []
      const queue = [originId]
      depths[originId] = 0
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor]
        records.forEach(function (relationship) {
          let next = null
          if (direction === 'downstream' && relationship.from === current) next = relationship.to
          else if (direction === 'upstream' && relationship.to === current) next = relationship.from
          if (isMissing(next) || Object.prototype.hasOwnProperty.call(depths, next)) return
          depths[next] = depths[current] + 1
          queue.push(next)
        })
      }
      queue.forEach(function (id) {
        order.push(id)
      })
      const edgeKeys = []
      records.forEach(function (relationship) {
        if (
          Object.prototype.hasOwnProperty.call(depths, relationship.from) &&
          Object.prototype.hasOwnProperty.call(depths, relationship.to)
        )
          edgeKeys.push(relationship.key)
      })
      const maxDepth = order.reduce(function (maximum, id) {
        return Math.max(maximum, depths[id])
      }, 0)
      return {
        depths,
        direction,
        edgeKeys,
        maxDepth,
        nodeIds: order,
        originId,
      }
    }
    function reachabilityFor(id, direction) {
      return computeReachability(id, direction, reachabilityRelationships())
    }
    function resetReachabilityButtons() {
      upstreamBtn.setAttribute('aria-pressed', 'false')
      downstreamBtn.setAttribute('aria-pressed', 'false')
    }
    function clearReachability(options) {
      options = options || {}
      reachabilityMode = null
      activeReachability = null
      svg.removeAttribute('data-reach-active')
      chip.removeAttribute('data-reach-mode')
      nodes().forEach(function (node) {
        node.removeAttribute('data-reach-match')
        node.removeAttribute('data-reach-origin')
        node.removeAttribute('data-reach-depth')
      })
      edges().forEach(function (edge) {
        edge.removeAttribute('data-reach-match')
        edge.removeAttribute('data-reach-depth')
      })
      resetReachabilityButtons()
      reachStatus.textContent = ''
      reachStatus.hidden = true
      if (options.updateUrl === true && activeIds.length === 1) {
        try {
          history.replaceState(
            null,
            '',
            location.pathname + location.search + '#focus=' + encodeURIComponent(activeIds[0]),
          )
        } catch (_) {
          reportArchifyFailure(_)
        }
      }
    }
    function renderReachabilityControls(id) {
      const upstream = reachabilityFor(id, 'upstream')
      const downstream = reachabilityFor(id, 'downstream')
      const upstreamReach = upstream ? Math.max(0, upstream.nodeIds.length - 1) : 0
      const downstreamReach = downstream ? Math.max(0, downstream.nodeIds.length - 1) : 0
      upstreamCount.textContent = String(upstreamReach)
      downstreamCount.textContent = String(downstreamReach)
      upstreamBtn.disabled = upstreamReach === 0
      downstreamBtn.disabled = downstreamReach === 0
      upstreamBtn.setAttribute(
        'aria-label',
        upstreamReach
          ? viewerCount('viewer.passport.reach.upstream', upstreamReach)
          : viewerText('viewer.passport.reach.noUpstream'),
      )
      downstreamBtn.setAttribute(
        'aria-label',
        downstreamReach
          ? viewerCount('viewer.passport.reach.downstream', downstreamReach)
          : viewerText('viewer.passport.reach.noDownstream'),
      )
      reachSection.hidden = false
    }
    function applyReachability(direction, options) {
      options = options || {}
      if (activeIds.length !== 1 || (direction !== 'upstream' && direction !== 'downstream')) return false
      if (reachabilityMode === direction && options.toggle !== false) {
        clearReachability({ updateUrl: options.updateUrl !== false })
        return true
      }
      const result = reachabilityFor(activeIds[0], direction)
      if (!result || result.nodeIds.length <= 1) return false
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, resetView: false, updateUrl: false })
      }
      clearRelationshipPreview({ clearPin: true })
      clearReachability({ updateUrl: false })
      reachabilityMode = direction
      activeReachability = result
      const edgeKeySet = Object.create(null)
      result.edgeKeys.forEach(function (key) {
        edgeKeySet[key] = true
      })
      svg.setAttribute('data-reach-active', direction)
      chip.setAttribute('data-reach-mode', direction)
      nodes().forEach(function (node) {
        const id = node.getAttribute('data-node-id')
        if (!Object.prototype.hasOwnProperty.call(result.depths, id)) return
        node.setAttribute('data-reach-match', '')
        node.setAttribute('data-reach-depth', String(result.depths[id]))
        if (id === result.originId) node.setAttribute('data-reach-origin', '')
      })
      edges().forEach(function (edge) {
        const key =
          edge.getAttribute('data-edge-key') ||
          edge.getAttribute('data-edge-from') +
            '\0' +
            edge.getAttribute('data-edge-to') +
            '\0' +
            (edge.getAttribute('data-edge-label') || '')
        if (!edgeKeySet[key]) return
        edge.setAttribute('data-reach-match', '')
        const fromDepth = result.depths[edge.getAttribute('data-edge-from')]
        const toDepth = result.depths[edge.getAttribute('data-edge-to')]
        edge.setAttribute('data-reach-depth', String(Math.max(fromDepth || 0, toDepth || 0)))
      })
      resetReachabilityButtons()
      const activeButton = direction === 'upstream' ? upstreamBtn : downstreamBtn
      activeButton.setAttribute('aria-pressed', 'true')
      const reachableCount = result.nodeIds.length - 1
      const directionLabel = viewerText(
        direction === 'upstream' ? 'viewer.passport.upstream' : 'viewer.passport.downstream',
      )
      reachStatus.textContent = viewerText('viewer.passport.reach.status', {
        direction: directionLabel,
        hops: result.maxDepth,
        links: result.edgeKeys.length,
        nodes: reachableCount,
      })
      reachStatus.hidden = false
      if (options.updateUrl !== false) {
        try {
          history.replaceState(
            null,
            '',
            location.pathname + location.search + '#focus=' + encodeURIComponent(activeIds[0]) + '&reach=' + direction,
          )
        } catch (_) {
          reportArchifyFailure(_)
        }
      }
      if (options.reveal !== false && Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal(result.nodeIds, { includeNeighbors: false, reason: 'reachability' })
      }
      requestLensPlacement()
      return true
    }
    function reachabilitySnapshot() {
      if (
        !activeReachability ||
        activeIds.length !== 1 ||
        (reachabilityMode !== 'upstream' && reachabilityMode !== 'downstream') ||
        activeReachability.direction !== reachabilityMode ||
        activeReachability.originId !== activeIds[0] ||
        svg.getAttribute('data-reach-active') !== reachabilityMode
      )
        return null
      const originId = activeReachability.originId
      const nodeIds = activeReachability.nodeIds.slice()
      const edgeKeys = activeReachability.edgeKeys.slice()
      if (
        nodeIds.length < 2 ||
        nodeIds[0] !== originId ||
        !edgeKeys.length ||
        !activeReachability.depths ||
        !Number.isInteger(activeReachability.maxDepth) ||
        activeReachability.maxDepth < 1
      )
        return null
      const allNodes = nodes()
      const allEdges = edges()
      const seenNodeIds = Object.create(null)
      const seenEdgeKeys = Object.create(null)
      const nodeIdSet = Object.create(null)
      const depths = Object.create(null)
      let originNode = null
      let measuredMaxDepth = 0
      if (
        nodeIds.some(function (id) {
          const depth = activeReachability.depths[id]
          const matches = allNodes.filter(function (node) {
            return node.getAttribute('data-node-id') === id
          })
          if (
            typeof id !== 'string' ||
            !id ||
            seenNodeIds[id] ||
            matches.length !== 1 ||
            !matches[0].hasAttribute('data-reach-match') ||
            !Number.isInteger(depth) ||
            depth < 0 ||
            depth > activeReachability.maxDepth ||
            (id === originId ? !matches[0].hasAttribute('data-reach-origin') || depth !== 0 : depth < 1)
          )
            return true
          seenNodeIds[id] = true
          nodeIdSet[id] = true
          depths[id] = depth
          measuredMaxDepth = Math.max(measuredMaxDepth, depth)
          if (id === originId) originNode = matches[0]
          return false
        }) ||
        !originNode ||
        measuredMaxDepth !== activeReachability.maxDepth ||
        allNodes.filter(function (node) {
          return node.hasAttribute('data-reach-match')
        }).length !== nodeIds.length
      )
        return null
      const edgeRecords = []
      if (
        edgeKeys.some(function (key) {
          if (typeof key !== 'string' || !key || seenEdgeKeys[key]) return true
          const fragments = allEdges.filter(function (edge) {
            return edge.getAttribute('data-edge-key') === key
          })
          const drawableFragments = fragments.filter(hasDrawableGeometry)
          if (
            !fragments.length ||
            drawableFragments.length !== 1 ||
            !fragments.every(function (fragment) {
              return fragment.hasAttribute('data-reach-match')
            })
          )
            return true
          const first = fragments[0]
          const from = first.getAttribute('data-edge-from')
          const to = first.getAttribute('data-edge-to')
          const id = first.getAttribute('data-edge-id') || ''
          const labelValue = first.getAttribute('data-edge-label') || ''
          if (
            !nodeIdSet[from] ||
            !nodeIdSet[to] ||
            !fragments.every(function (fragment) {
              return (
                fragment.getAttribute('data-edge-from') === from &&
                fragment.getAttribute('data-edge-to') === to &&
                (fragment.getAttribute('data-edge-id') || '') === id
              )
            })
          )
            return true
          seenEdgeKeys[key] = true
          edgeRecords.push({
            depth: Math.max(depths[from], depths[to]),
            from,
            id,
            key,
            label: labelValue,
            to,
          })
          return false
        })
      )
        return null
      const liveEdgeKeys = Object.create(null)
      if (
        allEdges.some(function (edge) {
          if (!edge.hasAttribute('data-reach-match')) return false
          const key = edge.getAttribute('data-edge-key')
          if (!key || !seenEdgeKeys[key]) return true
          liveEdgeKeys[key] = true
          return false
        }) ||
        Object.keys(liveEdgeKeys).length !== edgeKeys.length
      )
        return null
      return {
        depths,
        direction: reachabilityMode,
        edges: edgeRecords,
        maxDepth: activeReachability.maxDepth,
        nodeIds,
        origin: { id: originId, label: nodeLabel(originNode, originId) },
      }
    }
    function setPassportValue(element, value) {
      const normalized = isMissing(value) ? '' : String(value).trim()
      element.textContent = normalized
      element.hidden = !normalized
    }
    function renderSourceEvidence(id) {
      evidenceLinks.textContent = ''
      repositoryLink.removeAttribute('href')
      repositoryLink.textContent = ''
      const sources = Archify.sourceEvidence.node(id)
      const repository = Archify.sourceEvidence.repository()
      if (!repository || !sources.length) {
        evidence.hidden = true
        return
      }
      const slug = repository.url.replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '')
      repositoryLink.href = repository.url + '/tree/' + repository.revision
      repositoryLink.textContent = slug + ' @ ' + repository.shortRevision
      repositoryLink.setAttribute(
        'aria-label',
        viewerText('viewer.passport.repository.open', { revision: repository.revision }),
      )
      sources.forEach(function (source) {
        const link = document.createElement('a')
        link.className = 'semantic-passport-source'
        link.href = source.href
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.referrerPolicy = 'no-referrer'
        link.setAttribute(
          'aria-label',
          viewerText('viewer.passport.source.open', { path: source.path, revision: repository.shortRevision }),
        )
        const name = document.createElement('strong')
        name.textContent = source.label || source.path.split('/').pop() || source.path
        const location2 = document.createElement('code')
        location2.textContent = source.line
          ? 'L' +
            source.line +
            (source.endLine && source.endLine !== source.line ? '\u2013' + source.endLine : '') +
            ' \u2197'
          : viewerText('viewer.passport.source.openLink')
        const sourcePath = document.createElement('small')
        sourcePath.textContent = source.path
        link.appendChild(name)
        link.appendChild(location2)
        link.appendChild(sourcePath)
        evidenceLinks.appendChild(link)
      })
      evidence.hidden = false
    }
    function renderPassport(id, node) {
      setPassportValue(detail, node.getAttribute('data-node-sublabel'))
      setPassportValue(kind, viewerKindLabel(node.getAttribute('data-node-kind') || 'node'))
      setPassportValue(context, node.getAttribute('data-node-context'))
      setPassportValue(tag, node.getAttribute('data-node-tag'))
      setPassportValue(document.getElementById('focus-brand'), node.getAttribute('data-node-brand'))
      semanticId.textContent = id
      semanticId.hidden = false
      renderSourceEvidence(id)
    }
    function relationshipsFor(id, byId) {
      const seen = {}
      const relationships = []
      edges().forEach(function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        if (from !== id && to !== id) return
        const edgeLabel = edge.getAttribute('data-edge-label') || ''
        const edgeKey = edge.getAttribute('data-edge-key') || from + '\0' + to + '\0' + edgeLabel
        const edgeId = edge.getAttribute('data-edge-id') || ''
        if (seen[edgeKey]) return
        seen[edgeKey] = true
        const direction = from === id && to === id ? 'loop' : from === id ? 'out' : 'in'
        const neighborId = direction === 'in' ? from : to
        const neighbor = byId[neighborId]
        relationships.push({
          direction,
          from,
          id: edgeId,
          key: edgeKey,
          label:
            edgeLabel ||
            viewerText(
              direction === 'loop'
                ? 'viewer.passport.relationship.loopsBack'
                : direction === 'out'
                  ? 'viewer.passport.relationship.connectsTo'
                  : 'viewer.passport.relationship.connectsFrom',
            ),
          neighborId,
          neighborLabel: neighbor ? nodeLabel(neighbor, neighborId) : neighborId,
          to,
        })
      })
      return relationships
    }
    function relationshipEdgeShapes(edge) {
      if (!edge) return []
      if (/^(path|line|polyline)$/i.test(edge.tagName || '')) return [edge]
      return Array.prototype.slice.call(edge.querySelectorAll('path, line, polyline'))
    }
    function relationshipHitRecords() {
      const recordsByKey = {}
      const recordsById = {}
      const byId = {}
      nodes().forEach(function (node) {
        byId[node.getAttribute('data-node-id')] = node
      })
      const records = []
      edges().forEach(function (edge) {
        const shapes = relationshipEdgeShapes(edge)
        if (!shapes.length) return
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        const labelValue = edge.getAttribute('data-edge-label') || ''
        const edgeId = edge.getAttribute('data-edge-id') || ''
        const key = edge.getAttribute('data-edge-key') || from + '\0' + to + '\0' + labelValue
        const existing = recordsByKey[key]
        if (existing) {
          if (
            existing.from !== from ||
            existing.to !== to ||
            existing.labelValue !== labelValue ||
            existing.id !== edgeId
          ) {
            existing.invalid = true
            return
          }
          shapes.forEach(function (shape) {
            if (existing.shapes.indexOf(shape) === -1) existing.shapes.push(shape)
          })
          return
        }
        const record = {
          edge,
          from,
          fromLabel: byId[from] ? nodeLabel(byId[from], from) : from,
          id: edgeId,
          invalid: false,
          key,
          label:
            labelValue ||
            viewerText(
              from === to ? 'viewer.passport.relationship.loopsBack' : 'viewer.passport.relationship.connectsTo',
            ),
          labelValue,
          shapes,
          to,
          toLabel: byId[to] ? nodeLabel(byId[to], to) : to,
        }
        recordsByKey[key] = record
        if (edgeId) {
          if (recordsById[edgeId]) {
            recordsById[edgeId].invalid = true
            record.invalid = true
          } else {
            recordsById[edgeId] = record
          }
        }
        records.push(record)
      })
      return records.filter(function (record) {
        return !record.invalid && record.from && record.to
      })
    }
    function relationshipRecordForKey(key) {
      return (
        relationshipHitRecords().find(function (record) {
          return record.key === key
        }) || null
      )
    }
    function pinnedRelationshipRecord() {
      return pinnedRelationshipKey ? relationshipRecordForKey(pinnedRelationshipKey) : null
    }
    function renderRelationshipCopyAction() {
      const record = pinnedRelationshipRecord()
      if (record && record.id) {
        copyBtn.textContent = viewerText('viewer.passport.copyRelation')
        copyBtn.setAttribute('aria-label', viewerText('viewer.passport.copyPinned'))
      } else if (pinnedRelationshipKey) {
        copyBtn.textContent = viewerText('viewer.passport.copyNode')
        copyBtn.setAttribute('aria-label', viewerText('viewer.passport.copySource'))
      } else {
        copyBtn.textContent = viewerText('viewer.passport.copy')
        copyBtn.setAttribute('aria-label', viewerText('viewer.passport.copy.focus'))
      }
    }
    function relationshipHitGeometry(shape, className) {
      const clone = shape.cloneNode(false)
      clone.removeAttribute('id')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.removeAttribute('filter')
      clone.removeAttribute('marker-start')
      clone.removeAttribute('marker-mid')
      clone.removeAttribute('marker-end')
      clone.removeAttribute('role')
      clone.removeAttribute('tabindex')
      clone.removeAttribute('aria-label')
      clone.removeAttribute('aria-labelledby')
      clone.removeAttribute('aria-hidden')
      clone.removeAttribute('data-animate')
      clone.removeAttribute('data-edge-from')
      clone.removeAttribute('data-edge-to')
      clone.removeAttribute('data-edge-key')
      clone.removeAttribute('data-edge-id')
      clone.removeAttribute('data-edge-label')
      clone.setAttribute('class', className || 'relationship-hit-rail')
      return clone
    }
    function removeRelationshipPulse() {
      Array.prototype.forEach.call(svg.querySelectorAll('[data-relationship-pulse-overlay]'), function (element) {
        element.remove()
      })
    }
    function relationshipPulseGeometry(shape) {
      const clone = shape.cloneNode(false)
      clone.removeAttribute('id')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.removeAttribute('transform')
      clone.removeAttribute('filter')
      clone.removeAttribute('marker-start')
      clone.removeAttribute('marker-mid')
      clone.removeAttribute('marker-end')
      clone.removeAttribute('role')
      clone.removeAttribute('tabindex')
      clone.removeAttribute('aria-label')
      clone.removeAttribute('aria-hidden')
      clone.removeAttribute('data-animate')
      clone.removeAttribute('data-edge-from')
      clone.removeAttribute('data-edge-to')
      clone.removeAttribute('data-edge-key')
      clone.removeAttribute('data-edge-id')
      clone.removeAttribute('data-edge-label')
      clone.removeAttribute('data-focus-match')
      clone.removeAttribute('data-relationship-preview')
      clone.setAttribute('class', 'relationship-flow-pulse')
      clone.setAttribute('pathLength', '1')
      return clone
    }
    function relationshipTokenKind(edge) {
      const shapes = relationshipEdgeShapes(edge)
      const classEvidence = [edge.getAttribute('class') || '']
        .concat(
          shapes.map(function (shape) {
            return shape.getAttribute('class') || ''
          }),
        )
        .join(' ')
      const from = edge.getAttribute('data-edge-from') || ''
      const to = edge.getAttribute('data-edge-to') || ''
      const source = nodes().find(function (node) {
        return node.getAttribute('data-node-id') === from
      })
      const target = nodes().find(function (node) {
        return node.getAttribute('data-node-id') === to
      })
      const sourceKind = source ? source.getAttribute('data-node-kind') || 'neutral' : 'neutral'
      const targetKind = target ? target.getAttribute('data-node-kind') || 'neutral' : 'neutral'
      if (
        /\ba-security\b/.test(classEvidence) ||
        sourceKind === 'security' ||
        targetKind === 'security' ||
        targetKind === 'failure'
      )
        return 'security'
      if (/\ba-dashed\b/.test(classEvidence) || sourceKind === 'messagebus' || targetKind === 'messagebus')
        return 'event'
      if (sourceKind === 'database' || targetKind === 'database') return 'data'
      if (targetKind === 'waiting' || targetKind === 'success') return 'state'
      return 'call'
    }
    function relationshipTokenPath(shape) {
      if (!shape) return ''
      const tagName = String(shape.tagName || '').toLowerCase()
      if (tagName === 'path') return shape.getAttribute('d') || ''
      if (tagName === 'line') {
        return (
          'M ' +
          shape.getAttribute('x1') +
          ' ' +
          shape.getAttribute('y1') +
          ' L ' +
          shape.getAttribute('x2') +
          ' ' +
          shape.getAttribute('y2')
        )
      }
      if (tagName === 'polyline' && shape.points && shape.points.numberOfItems > 1) {
        const commands = []
        for (let i = 0; i < shape.points.numberOfItems; i += 1) {
          const point = shape.points.getItem(i)
          commands.push((i === 0 ? 'M ' : 'L ') + point.x + ' ' + point.y)
        }
        return commands.join(' ')
      }
      return ''
    }
    function relationshipTokenPart(tagName, className, attrs) {
      const part = document.createElementNS(svgNamespace, tagName)
      part.setAttribute('class', className)
      Object.keys(attrs || {}).forEach(function (name) {
        part.setAttribute(name, attrs[name])
      })
      return part
    }
    function relationshipTokenGeometry(shape, kind2, key, options) {
      options = options || {}
      const pathData = relationshipTokenPath(shape)
      if (!pathData) return null
      const token = document.createElementNS(svgNamespace, 'g')
      token.setAttribute('class', 'semantic-flow-token ' + (options.className || 'relationship-flow-token'))
      token.setAttribute('data-token-kind', kind2)
      token.setAttribute('data-token-edge-key', key)
      token.setAttribute('aria-hidden', 'true')
      token.appendChild(relationshipTokenPart('circle', 'semantic-flow-token-halo', { cx: '0', cy: '0', r: '7' }))
      if (kind2 === 'data') {
        token.appendChild(
          relationshipTokenPart('rect', 'relationship-flow-token-shape', {
            height: '8',
            rx: '2',
            width: '10',
            x: '-5',
            y: '-4',
          }),
        )
        token.appendChild(
          relationshipTokenPart('path', 'relationship-flow-token-ink', { d: 'M -2.8 -1.2 h 5.6 M -2.8 1.4 h 3.8' }),
        )
      } else if (kind2 === 'event') {
        token.appendChild(
          relationshipTokenPart('rect', 'relationship-flow-token-shape', {
            height: '6',
            rx: '1',
            width: '4',
            x: '-7',
            y: '-3',
          }),
        )
        token.appendChild(
          relationshipTokenPart('rect', 'relationship-flow-token-shape', {
            height: '6',
            rx: '1',
            width: '4',
            x: '-2',
            y: '-3',
          }),
        )
        token.appendChild(
          relationshipTokenPart('rect', 'relationship-flow-token-shape', {
            height: '6',
            rx: '1',
            width: '4',
            x: '3',
            y: '-3',
          }),
        )
      } else if (kind2 === 'security') {
        token.appendChild(
          relationshipTokenPart('path', 'relationship-flow-token-shape', {
            d: 'M 0 -5 L 4 -3.4 V 0 c 0 3 -1.6 4.5 -4 5.5 C -2.4 4.5 -4 3 -4 0 v -3.4 Z',
          }),
        )
        token.appendChild(
          relationshipTokenPart('path', 'relationship-flow-token-ink', { d: 'm -2 .2 1.4 1.4 L 2 -1.4' }),
        )
      } else if (kind2 === 'state') {
        token.appendChild(
          relationshipTokenPart('circle', 'relationship-flow-token-shape', { cx: '0', cy: '0', r: '5' }),
        )
        token.appendChild(
          relationshipTokenPart('circle', 'relationship-flow-token-dot', { cx: '0', cy: '0', r: '1.35' }),
        )
      } else {
        token.appendChild(
          relationshipTokenPart('path', 'relationship-flow-token-ink', {
            d: 'M -5 -3 L -1 0 L -5 3 M 0 -3 L 4 0 L 0 3',
          }),
        )
      }
      const motion = document.createElementNS(svgNamespace, 'animateMotion')
      motion.setAttribute('path', pathData)
      motion.setAttribute('dur', options.duration || '1.2s')
      motion.setAttribute('begin', '0s')
      motion.setAttribute('fill', 'freeze')
      motion.setAttribute('rotate', 'auto')
      motion.setAttribute('calcMode', 'spline')
      motion.setAttribute('keyTimes', '0;1')
      motion.setAttribute('keySplines', '.2 0 .2 1')
      token.appendChild(motion)
      return token
    }
    function createSemanticFlowToken(edge, shape, options) {
      if (!edge || !shape) return null
      const key =
        edge.getAttribute('data-edge-key') ||
        edge.getAttribute('data-edge-from') +
          '\0' +
          edge.getAttribute('data-edge-to') +
          '\0' +
          (edge.getAttribute('data-edge-label') || '')
      return relationshipTokenGeometry(shape, relationshipTokenKind(edge), key, options)
    }
    Archify.flowTokens = {
      create: createSemanticFlowToken,
      kind: function (edge) {
        return relationshipTokenKind(edge)
      },
      path: relationshipTokenPath,
    }
    function renderRelationshipPulse(key) {
      removeRelationshipPulse()
      if (!key || document.documentElement.getAttribute('data-embed') === 'true') return false
      if (document.hidden || (Archify.motionGovernor && Archify.motionGovernor.isPaused())) return false
      if (reducedMotionQuery && reducedMotionQuery.matches) return false
      const matchingEdges = edges().filter(function (edge) {
        return edge.getAttribute('data-edge-key') === key
      })
      if (!matchingEdges.length) return false
      const overlay = document.createElementNS(svgNamespace, 'g')
      overlay.setAttribute('class', 'relationship-pulse-overlay')
      overlay.setAttribute('data-relationship-pulse-overlay', '')
      overlay.setAttribute('data-relationship-pulse-key', key)
      overlay.setAttribute('aria-hidden', 'true')
      let tokenAdded = false
      matchingEdges.forEach(function (edge) {
        const wrapper = document.createElementNS(svgNamespace, 'g')
        if (edge.hasAttribute('transform')) wrapper.setAttribute('transform', edge.getAttribute('transform'))
        const shapes = relationshipEdgeShapes(edge)
        shapes.forEach(function (shape) {
          wrapper.appendChild(relationshipPulseGeometry(shape))
        })
        if (!tokenAdded && shapes.length) {
          const tokenKind = relationshipTokenKind(edge)
          const token = relationshipTokenGeometry(shapes[0], tokenKind, key)
          if (token) {
            wrapper.appendChild(token)
            overlay.setAttribute('data-relationship-token-kind', tokenKind)
            tokenAdded = true
          }
        }
        if (wrapper.childNodes.length) overlay.appendChild(wrapper)
      })
      if (!overlay.childNodes.length) return false
      const finishPulse = function () {
        if (overlay.parentNode) overlay.remove()
      }
      overlay.addEventListener('animationend', finishPulse, { once: true })
      overlay.addEventListener('animationcancel', finishPulse, { once: true })
      const firstNode = svg.querySelector('[data-node-id]')
      if (firstNode) svg.insertBefore(overlay, firstNode)
      else svg.appendChild(overlay)
      return true
    }
    function clearRelationshipPreview(options) {
      options = options || {}
      if (directPreviewTimer) browser.clearTimeout(directPreviewTimer)
      directPreviewTimer = null
      removeRelationshipPulse()
      activeRelationshipPreview = null
      svg.removeAttribute('data-relationship-preview-active')
      svg.removeAttribute('data-relationship-direct-active')
      if (options.clearPin === true) {
        pinnedRelationship = null
        pinnedRelationshipKey = null
        svg.removeAttribute('data-relationship-pin-active')
      }
      chip.removeAttribute('data-relationship-previewing')
      edges().forEach(function (edge) {
        edge.removeAttribute('data-relationship-preview')
      })
      nodes().forEach(function (node) {
        node.removeAttribute('data-relationship-preview-node')
        node.removeAttribute('data-relationship-preview-source')
        node.removeAttribute('data-relationship-preview-target')
      })
      Array.prototype.forEach.call(relationshipList.querySelectorAll('[data-preview-active]'), function (button) {
        button.removeAttribute('data-preview-active')
      })
      relationshipHitTargets.forEach(function (target) {
        target.setAttribute(
          'aria-pressed',
          pinnedRelationshipKey && target.getAttribute('data-relationship-key') === pinnedRelationshipKey
            ? 'true'
            : 'false',
        )
        target.removeAttribute('data-preview-active')
      })
      renderRelationshipCopyAction()
      requestLensPlacement()
    }
    function previewRelationship(button, options) {
      options = options || {}
      if (pinnedRelationshipKey && pinnedRelationship && button !== pinnedRelationship) return
      clearRelationshipPreview()
      if (!button) return
      const key = button.getAttribute('data-relationship-key')
      const from = button.getAttribute('data-relationship-from')
      const to = button.getAttribute('data-relationship-to')
      if (!key || !from || !to) return
      svg.setAttribute('data-relationship-preview-active', key)
      if (options.direct === true) svg.setAttribute('data-relationship-direct-active', key)
      edges().forEach(function (edge) {
        if (edge.getAttribute('data-edge-key') === key) edge.setAttribute('data-relationship-preview', '')
      })
      nodes().forEach(function (node) {
        const id = node.getAttribute('data-node-id')
        if (id !== from && id !== to) return
        node.setAttribute('data-relationship-preview-node', '')
        if (id === from) node.setAttribute('data-relationship-preview-source', '')
        if (id === to) node.setAttribute('data-relationship-preview-target', '')
      })
      button.setAttribute('data-preview-active', 'true')
      if (!chip.hidden && options.direct !== true) chip.setAttribute('data-relationship-previewing', 'true')
      activeRelationshipPreview = button
      renderRelationshipPulse(key)
      requestLensPlacement()
    }
    function syncRelationshipPreview() {
      const next = pinnedRelationship || focusedRelationship || hoveredRelationship
      if (next === activeRelationshipPreview) return
      previewRelationship(next, { direct: !!(next && next.hasAttribute('data-relationship-hit-key')) })
    }
    function directRelationshipBlocked() {
      return (
        html.getAttribute('data-embed') === 'true' ||
        html.getAttribute('data-guide-open') === 'true' ||
        container.classList.contains('is-panning') ||
        (activeIds.length > 0 && !pinnedRelationshipKey) ||
        svg.hasAttribute('data-story-active') ||
        svg.hasAttribute('data-route-picking') ||
        svg.hasAttribute('data-route-active') ||
        svg.hasAttribute('data-lens-active') ||
        svg.hasAttribute('data-chapter-preview')
      )
    }
    function scheduleDirectRelationshipPreview(target) {
      if (directPreviewTimer) browser.clearTimeout(directPreviewTimer)
      if (pinnedRelationshipKey) return
      directPreviewTimer = browser.setTimeout(
        function () {
          directPreviewTimer = null
          if (pinnedRelationshipKey || hoveredRelationship !== target || directRelationshipBlocked()) return
          previewRelationship(target, { direct: true })
        },
        reducedMotionQuery && reducedMotionQuery.matches ? 0 : 90,
      )
    }
    function relationshipHitTarget(key) {
      return (
        relationshipHitTargets.find(function (target) {
          return target.getAttribute('data-relationship-key') === key
        }) || null
      )
    }
    function revealPinnedRelationship(record) {
      function reveal() {
        if (!record || pinnedRelationshipKey !== record.key) return true
        if (!Archify.view || typeof Archify.view.reveal !== 'function') return false
        Archify.view.reveal([record.from, record.to], { reason: 'relationship-direct' })
        return true
      }
      if (!reveal()) requestAnimationFrame(reveal)
    }
    function inspectRelationship(key, options) {
      options = options || {}
      if (html.getAttribute('data-embed') === 'true') return false
      if (directPreviewTimer) browser.clearTimeout(directPreviewTimer)
      directPreviewTimer = null
      hoveredRelationship = null
      focusedRelationship = null
      if (pinnedRelationshipKey === key) {
        if (options.toggle === false) return true
        clear({ updateUrl: options.updateUrl !== false })
        return true
      }
      const record = relationshipRecordForKey(key)
      if (!record) return false
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, updateUrl: false })
      }
      set(record.from, { toggle: false, updateUrl: false })
      const row = Array.prototype.slice
        .call(relationshipList.querySelectorAll('[data-relationship-key]'))
        .find(function (candidate) {
          return candidate.getAttribute('data-relationship-key') === key
        })
      if (!row) return false
      previewRelationship(row)
      pinnedRelationship = row
      pinnedRelationshipKey = key
      svg.setAttribute('data-relationship-pin-active', key)
      const target = relationshipHitTarget(key)
      if (target) target.setAttribute('aria-pressed', 'true')
      renderRelationshipCopyAction()
      summary.textContent = viewerText('viewer.passport.relationship.pinned', {
        from: record.fromLabel,
        label: record.label,
        to: record.toLabel,
      })
      revealPinnedRelationship(record)
      if (options.updateUrl !== false && record.id) {
        try {
          history.replaceState(
            null,
            '',
            location.pathname + location.search + '#relation=' + encodeURIComponent(record.id),
          )
        } catch (_) {
          reportArchifyFailure(_)
        }
      }
      return true
    }
    function inspectRelationshipById(id, options) {
      const record = relationshipHitRecords().find(function (item) {
        return item.id === id
      })
      return record ? inspectRelationship(record.key, options) : false
    }
    function installRelationshipHitTargets() {
      if (html.getAttribute('data-embed') === 'true') return 0
      const records = relationshipHitRecords()
      if (!records.length) return 0
      relationshipHitOverlay = document.createElementNS(svgNamespace, 'g')
      relationshipHitOverlay.setAttribute('class', 'relationship-hit-overlay')
      relationshipHitOverlay.setAttribute('data-relationship-hit-overlay', '')
      relationshipHitOverlay.setAttribute('role', 'group')
      relationshipHitOverlay.setAttribute('aria-label', viewerText('viewer.passport.relationship.explorer'))
      const relationshipHelp = document.createElementNS(svgNamespace, 'desc')
      relationshipHelp.id = 'archify-relationship-help'
      relationshipHelp.textContent = viewerText('viewer.passport.relationship.help')
      relationshipHitOverlay.appendChild(relationshipHelp)
      records.forEach(function (record, index) {
        const target = document.createElementNS(svgNamespace, 'g')
        target.setAttribute('class', 'relationship-hit-target')
        target.setAttribute('data-relationship-hit-key', record.key)
        target.setAttribute('data-relationship-key', record.key)
        target.setAttribute('data-relationship-from', record.from)
        target.setAttribute('data-relationship-to', record.to)
        if (record.id) target.setAttribute('data-relationship-id', record.id)
        target.setAttribute('role', 'button')
        target.setAttribute('tabindex', index === 0 ? '0' : '-1')
        target.setAttribute('aria-pressed', 'false')
        target.setAttribute('aria-describedby', relationshipHelp.id)
        const description = viewerText('viewer.passport.relationship.inspect', {
          from: record.fromLabel,
          index: index + 1,
          label: record.label,
          to: record.toLabel,
          total: records.length,
        })
        target.setAttribute('aria-label', description)
        const title = document.createElementNS(svgNamespace, 'title')
        title.textContent = record.fromLabel + ' \u2192 ' + record.toLabel + ' \xB7 ' + record.label
        target.appendChild(title)
        record.shapes.forEach(function (shape) {
          target.appendChild(relationshipHitGeometry(shape))
          target.appendChild(relationshipHitGeometry(shape, 'relationship-focus-rail'))
        })
        if (target.childNodes.length > 1) {
          relationshipHitTargets.push(target)
          relationshipHitOverlay.appendChild(target)
        }
      })
      if (!relationshipHitTargets.length) return 0
      const firstNode = svg.querySelector('[data-node-id]')
      let nodeLayer = firstNode
      while (nodeLayer && nodeLayer.parentNode && nodeLayer.parentNode !== svg) nodeLayer = nodeLayer.parentNode
      if (nodeLayer && nodeLayer.parentNode === svg) svg.insertBefore(relationshipHitOverlay, nodeLayer)
      else svg.appendChild(relationshipHitOverlay)
      relationshipHitOverlay.addEventListener('pointerdown', function (event) {
        if (event.target.closest('[data-relationship-hit-key]')) event.stopPropagation()
      })
      relationshipHitOverlay.addEventListener('pointerover', function (event) {
        if (event.pointerType === 'touch') return
        if (finePointerQuery && !finePointerQuery.matches) return
        const target = event.target.closest('[data-relationship-hit-key]')
        if (!target || directRelationshipBlocked() || pinnedRelationshipKey) return
        if (event.relatedTarget && target.contains(event.relatedTarget)) return
        hoveredRelationship = target
        scheduleDirectRelationshipPreview(target)
      })
      relationshipHitOverlay.addEventListener('pointerout', function (event) {
        const target = event.target.closest('[data-relationship-hit-key]')
        if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return
        if (hoveredRelationship === target) hoveredRelationship = null
        syncRelationshipPreview()
      })
      relationshipHitOverlay.addEventListener('focusin', function (event) {
        const target = event.target.closest('[data-relationship-hit-key]')
        if (!target || directRelationshipBlocked()) return
        focusedRelationship = target
        if (!pinnedRelationshipKey) previewRelationship(target, { direct: true })
      })
      relationshipHitOverlay.addEventListener('focusout', function (event) {
        const target = event.target.closest('[data-relationship-hit-key]')
        if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return
        if (focusedRelationship === target) focusedRelationship = null
        syncRelationshipPreview()
      })
      relationshipHitOverlay.addEventListener('click', function (event) {
        const target = event.target.closest('[data-relationship-hit-key]')
        if (!target || directRelationshipBlocked()) return
        event.preventDefault()
        event.stopPropagation()
        focusedRelationship = null
        hoveredRelationship = null
        inspectRelationship(target.getAttribute('data-relationship-key'))
      })
      relationshipHitOverlay.addEventListener('keydown', function (event) {
        const target = event.target.closest('[data-relationship-hit-key]')
        if (!target) return
        if (event.key === 'Escape' && pinnedRelationshipKey) {
          event.preventDefault()
          clear({ updateUrl: false })
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          focusedRelationship = null
          hoveredRelationship = null
          inspectRelationship(target.getAttribute('data-relationship-key'))
          return
        }
        if (
          event.key !== 'ArrowRight' &&
          event.key !== 'ArrowLeft' &&
          event.key !== 'ArrowDown' &&
          event.key !== 'ArrowUp' &&
          event.key !== 'Home' &&
          event.key !== 'End'
        )
          return
        let index = relationshipHitTargets.indexOf(target)
        if (event.key === 'Home') index = 0
        else if (event.key === 'End') index = relationshipHitTargets.length - 1
        else if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
          index = (index + 1) % relationshipHitTargets.length
        else index = (index - 1 + relationshipHitTargets.length) % relationshipHitTargets.length
        event.preventDefault()
        relationshipHitTargets.forEach(function (item, itemIndex) {
          item.setAttribute('tabindex', itemIndex === index ? '0' : '-1')
        })
        try {
          relationshipHitTargets[index].focus({ preventScroll: true })
        } catch (_) {
          reportArchifyFailure(_)
          try {
            relationshipHitTargets[index].focus()
          } catch (_2) {
            reportArchifyFailure(_2)
          }
        }
      })
      return relationshipHitTargets.length
    }
    function renderRelationshipLens(id, byId) {
      hoveredRelationship = null
      focusedRelationship = null
      clearRelationshipPreview({ clearPin: true })
      renderPassport(id, byId[id])
      const relationships = relationshipsFor(id, byId)
      chip.removeAttribute('data-relations-expanded')
      relationsBtn.setAttribute('aria-expanded', 'false')
      relationsBtn.textContent = viewerCount('viewer.passport.relationship.count', relationships.length)
      relationsBtn.setAttribute('aria-label', viewerCount('viewer.passport.relationship.show', relationships.length))
      const counts = { in: 0, loop: 0, out: 0 }
      relationships.forEach(function (relationship) {
        counts[relationship.direction] += 1
      })
      summary.textContent = viewerText('viewer.passport.relationship.summary', {
        in: counts.in,
        loops: counts.loop ? viewerText('viewer.passport.relationship.loops', { count: counts.loop }) : '',
        out: counts.out,
      })
      renderReachabilityControls(id)
      relationshipList.textContent = ''
      if (!relationships.length) {
        const empty = document.createElement('p')
        empty.className = 'relationship-lens-empty'
        empty.textContent = viewerText('viewer.passport.relationship.none')
        relationshipList.appendChild(empty)
        return
      }
      ;[
        { id: 'out', label: viewerText('viewer.passport.relationship.group.out') },
        { id: 'in', label: viewerText('viewer.passport.relationship.group.in') },
        { id: 'loop', label: viewerText('viewer.passport.relationship.group.loop') },
      ].forEach(function (group) {
        const items = relationships.filter(function (relationship) {
          return relationship.direction === group.id
        })
        if (!items.length) return
        const section = document.createElement('div')
        section.className = 'relationship-lens-group'
        const heading = document.createElement('span')
        heading.className = 'relationship-lens-group-title'
        heading.textContent = group.label + ' \xB7 ' + items.length
        section.appendChild(heading)
        items.forEach(function (relationship) {
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'relationship-lens-row'
          button.setAttribute('data-direction', relationship.direction)
          button.setAttribute('data-relationship-target', relationship.neighborId)
          button.setAttribute('data-relationship-key', relationship.key)
          button.setAttribute('data-relationship-from', relationship.from)
          button.setAttribute('data-relationship-to', relationship.to)
          if (relationship.id) button.setAttribute('data-relationship-id', relationship.id)
          button.setAttribute(
            'aria-label',
            viewerText('viewer.passport.relationship.row', {
              group: group.label,
              neighbor: relationship.neighborLabel,
              relationship: relationship.label,
            }),
          )
          const direction = document.createElement('span')
          direction.className = 'relationship-lens-direction'
          direction.setAttribute('aria-hidden', 'true')
          direction.textContent = viewerText(
            relationship.direction === 'out'
              ? 'viewer.passport.relationship.direction.out'
              : relationship.direction === 'in'
                ? 'viewer.passport.relationship.direction.in'
                : 'viewer.passport.relationship.direction.loop',
          )
          const target = document.createElement('strong')
          target.textContent = relationship.neighborLabel
          const relation = document.createElement('small')
          relation.textContent = relationship.label
          button.appendChild(direction)
          button.appendChild(target)
          button.appendChild(relation)
          section.appendChild(button)
        })
        relationshipList.appendChild(section)
      })
    }
    let lensFrame = 0
    function placeRelationshipLens() {
      lensFrame = 0
      if (chip.hidden || activeIds.length !== 1) return
      const node = svg.querySelector('[data-node-id="' + activeIds[0] + '"]')
      if (!node) return
      const containerRect = container.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      if (containerRect.bottom <= 0 || containerRect.top >= browser.innerHeight) return
      const padding = browser.innerWidth <= 720 ? 8 : 16
      const visibleTop = Math.max(padding, -containerRect.top + padding)
      const visibleBottom = Math.min(containerRect.height - padding, browser.innerHeight - containerRect.top - padding)
      const maxTop = Math.max(padding, visibleBottom - chip.offsetHeight)
      const minTop = Math.min(visibleTop, maxTop)
      const nodeCenter = nodeRect.top - containerRect.top + nodeRect.height / 2
      const mobile = browser.innerWidth <= 720
      const previewingOnMobile = mobile && chip.getAttribute('data-relationship-previewing') === 'true'
      const compactOnMobile = mobile && chip.getAttribute('data-relations-expanded') !== 'true'
      let preferred
      if (compactOnMobile) {
        const nodeTop = nodeRect.top - containerRect.top
        const nodeBottom = nodeRect.bottom - containerRect.top
        const gap = 10
        const above = nodeTop - chip.offsetHeight - gap
        const below = nodeBottom + gap
        if (above >= visibleTop) preferred = above
        else if (below + chip.offsetHeight <= visibleBottom - 56) preferred = below
        else
          preferred =
            nodeCenter < (visibleTop + visibleBottom) / 2
              ? Math.max(minTop, visibleBottom - chip.offsetHeight - 56)
              : visibleTop
      } else if (previewingOnMobile) {
        const pinnedTop = visibleTop
        const pinnedBottom = Math.max(minTop, visibleBottom - chip.offsetHeight - 56)
        preferred = nodeCenter < (visibleTop + visibleBottom) / 2 ? pinnedBottom : pinnedTop
      } else {
        preferred = nodeCenter - chip.offsetHeight / 2
      }
      let top = Math.max(minTop, Math.min(maxTop, preferred))
      const chipRect = chip.getBoundingClientRect()
      const safeGap = 10
      const protectViewerChrome = !mobile || compactOnMobile || previewingOnMobile
      const protectedRects = (
        protectViewerChrome ? [svg.querySelector('[data-legend]'), container.querySelector('.diagram-nav')] : []
      )
        .filter(function (element) {
          if (!element || element.hidden) return false
          const style = browser.getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
        .map(function (element) {
          return element.getBoundingClientRect()
        })
        .filter(function (rect) {
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            chipRect.left < rect.right + safeGap &&
            chipRect.right > rect.left - safeGap
          )
        })
      if (protectedRects.length) {
        const candidates = [top, minTop, maxTop]
        protectedRects.forEach(function (rect) {
          candidates.push(
            rect.top - containerRect.top - chip.offsetHeight - safeGap,
            rect.bottom - containerRect.top + safeGap,
          )
        })
        const valid = candidates
          .map(function (candidate) {
            return Math.max(minTop, Math.min(maxTop, candidate))
          })
          .filter(function (candidate, index, all) {
            if (all.indexOf(candidate) !== index) return false
            const candidateTop = containerRect.top + candidate
            const candidateBottom = candidateTop + chip.offsetHeight
            return protectedRects.every(function (rect) {
              return candidateBottom <= rect.top - safeGap || candidateTop >= rect.bottom + safeGap
            })
          })
        valid.sort(function (first, second) {
          return Math.abs(first - preferred) - Math.abs(second - preferred)
        })
        if (valid.length) top = valid[0]
      }
      chip.style.top = Math.round(top) + 'px'
      if (Archify.radar && typeof Archify.radar.sync === 'function') Archify.radar.sync()
    }
    function requestLensPlacement() {
      if (lensFrame) return
      lensFrame = requestAnimationFrame(placeRelationshipLens)
    }
    function clear(options) {
      options = options || {}
      const restoreNode =
        options.restoreFocus === true && activeIds.length === 1
          ? svg.querySelector('[data-node-id="' + activeIds[0] + '"]')
          : null
      clearReachability({ updateUrl: false })
      if (Archify.intentTrace && typeof Archify.intentTrace.clear === 'function') {
        Archify.intentTrace.clear({ announce: false })
      }
      hoveredRelationship = null
      focusedRelationship = null
      clearRelationshipPreview({ clearPin: true })
      activeIds = []
      svg.removeAttribute('data-focus-active')
      nodes().forEach(function (node) {
        node.removeAttribute('data-focus-match')
        node.removeAttribute('data-focus-selected')
        node.setAttribute('aria-pressed', 'false')
      })
      edges().forEach(function (edge) {
        edge.removeAttribute('data-focus-match')
      })
      chip.hidden = true
      label.textContent = ''
      detail.textContent = ''
      detail.hidden = true
      kind.textContent = ''
      kind.hidden = true
      context.textContent = ''
      context.hidden = true
      tag.textContent = ''
      tag.hidden = true
      semanticId.textContent = ''
      semanticId.hidden = true
      evidence.hidden = true
      evidenceLinks.textContent = ''
      repositoryLink.removeAttribute('href')
      repositoryLink.textContent = ''
      summary.textContent = ''
      reachSection.hidden = true
      upstreamCount.textContent = '0'
      downstreamCount.textContent = '0'
      upstreamBtn.disabled = true
      downstreamBtn.disabled = true
      relationshipList.textContent = ''
      copyBtn.textContent = viewerText('viewer.passport.copy')
      copyBtn.setAttribute('aria-label', viewerText('viewer.passport.copy.focus'))
      relationsBtn.textContent = viewerText('viewer.passport.relations')
      relationsBtn.setAttribute('aria-label', viewerText('viewer.passport.relations.show'))
      relationsBtn.setAttribute('aria-expanded', 'false')
      chip.removeAttribute('data-relations-expanded')
      chip.style.removeProperty('top')
      if (options.preserveView !== true && Archify.view && typeof Archify.view.reset === 'function') {
        Archify.view.reset({ automatic: true })
      }
      if (options.updateUrl !== false) {
        try {
          history.replaceState(null, '', location.pathname + location.search)
        } catch (_) {
          reportArchifyFailure(_)
        }
      }
      if (restoreNode) {
        try {
          restoreNode.focus({ preventScroll: true })
        } catch (_) {
          reportArchifyFailure(_)
          try {
            restoreNode.focus()
          } catch (_2) {
            reportArchifyFailure(_2)
          }
        }
      }
    }
    function setMany(ids, options) {
      options = options || {}
      if (Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
        Archify.semanticLens.clearPreview()
      if (Archify.semanticLens && Archify.semanticLens.active()) {
        Archify.semanticLens.clear({ closePanel: true, preserveView: true, updateUrl: false })
      }
      if (options.preserveRoute !== true && Archify.routeProbe && typeof Archify.routeProbe.clear === 'function') {
        Archify.routeProbe.clear({ restoreFocus: false, updateUrl: false })
      }
      const nodeList = nodes()
      const byId = {}
      nodeList.forEach(function (node) {
        byId[node.getAttribute('data-node-id')] = node
      })
      const normalized = []
      ;(ids || []).forEach(function (id) {
        if (byId[id] && normalized.indexOf(id) === -1) normalized.push(id)
      })
      if (!normalized.length) return false
      if (
        normalized.length === activeIds.length &&
        normalized.every(function (id, index) {
          return activeIds[index] === id
        }) &&
        options.toggle !== false
      ) {
        clear()
        return true
      }
      clear({ preserveView: true, updateUrl: false })
      activeIds = normalized
      const selected = {}
      const related = {}
      const seenEdges = {}
      normalized.forEach(function (id) {
        selected[id] = true
        related[id] = true
      })
      const selectionMode = options.mode === 'selection' || normalized.length > 1
      edges().forEach(function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        const match = selectionMode ? selected[from] && selected[to] : selected[from] || selected[to]
        if (!match) return
        edge.setAttribute('data-focus-match', '')
        if (!selectionMode) {
          related[from] = true
          related[to] = true
        }
        const edgeKey =
          edge.getAttribute('data-edge-key') || from + '\0' + to + '\0' + (edge.getAttribute('data-edge-label') || '')
        if (!seenEdges[edgeKey]) {
          seenEdges[edgeKey] = true
        }
      })
      nodeList.forEach(function (node) {
        const nodeId = node.getAttribute('data-node-id')
        if (related[nodeId]) node.setAttribute('data-focus-match', '')
        if (selected[nodeId]) {
          node.setAttribute('data-focus-selected', '')
          node.setAttribute('aria-pressed', 'true')
        }
      })
      svg.setAttribute('data-focus-active', normalized.join(' '))
      const defaultLabel =
        normalized.length === 1
          ? nodeLabel(byId[normalized[0]], normalized[0])
          : viewerText('viewer.guided.chapter.selectedNodes', { count: normalized.length })
      label.textContent = options.label || defaultLabel
      chip.hidden = options.hideChip === true || normalized.length !== 1 || selectionMode
      if (!chip.hidden) {
        renderRelationshipLens(normalized[0], byId)
        requestLensPlacement()
      }
      if (options.updateUrl !== false) {
        const key = options.urlKey || 'focus'
        const value = options.urlValue || normalized[0]
        try {
          history.replaceState(
            null,
            '',
            location.pathname + location.search + '#' + key + '=' + encodeURIComponent(value),
          )
        } catch (_) {
          reportArchifyFailure(_)
        }
      }
      return true
    }
    function set(id, options) {
      options = options || {}
      options.mode = 'neighborhood'
      return setMany([id], options)
    }
    function fallbackCopy(value) {
      const field = document.createElement('textarea')
      field.value = value
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch (_) {
        reportArchifyFailure(_)
      }
      field.remove()
      return copied
    }
    function copyFocusLink() {
      if (activeIds.length !== 1) return Promise.resolve(false)
      const record = pinnedRelationshipRecord()
      const relationId = record && record.id
      const value =
        location.href.replace(/#.*$/, '') +
        (relationId
          ? '#relation=' + encodeURIComponent(relationId)
          : '#focus=' + encodeURIComponent(activeIds[0]) + (reachabilityMode ? '&reach=' + reachabilityMode : ''))
      const copy =
        browserNavigator.clipboard && typeof browserNavigator.clipboard.writeText === 'function'
          ? browserNavigator.clipboard
              .writeText(value)
              .then(function () {
                return true
              })
              .catch(function (error) {
                reportArchifyFailure(error)
                return fallbackCopy(value)
              })
          : Promise.resolve(fallbackCopy(value))
      return copy.then(function (copied) {
        copyBtn.textContent = viewerText(copied ? 'viewer.common.copied' : 'viewer.common.copyFailed')
        copyBtn.setAttribute(
          'aria-label',
          copied
            ? viewerText(relationId ? 'viewer.passport.copy.pinned.success' : 'viewer.passport.copy.focused.success')
            : viewerText(relationId ? 'viewer.passport.copy.pinned.failed' : 'viewer.passport.copy.focused.failed'),
        )
        browser.setTimeout(function () {
          renderRelationshipCopyAction()
        }, 1600)
        return copied
      })
    }
    svg.addEventListener('click', function (event) {
      if (container.getAttribute('data-just-panned') === 'true') return
      const node = event.target.closest('[data-node-id]')
      if (node) {
        const id = node.getAttribute('data-node-id')
        set(id)
        if (activeIds.indexOf(id) !== -1 && Archify.view && typeof Archify.view.reveal === 'function') {
          Archify.view.reveal([id], { includeNeighbors: true, reason: 'focus' })
        }
      } else if (activeIds.length) clear()
    })
    svg.addEventListener('keydown', function (event) {
      const node = event.target.closest('[data-node-id]')
      if (!node || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      const id = node.getAttribute('data-node-id')
      set(id)
      if (activeIds.indexOf(id) !== -1 && Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal([id], { includeNeighbors: true, reason: 'focus' })
      }
    })
    clearBtn.addEventListener('click', function () {
      clear({ restoreFocus: true })
    })
    copyBtn.addEventListener('click', copyFocusLink)
    upstreamBtn.addEventListener('click', function () {
      applyReachability('upstream')
    })
    downstreamBtn.addEventListener('click', function () {
      applyReachability('downstream')
    })
    relationsBtn.addEventListener('click', function () {
      const expanded = chip.getAttribute('data-relations-expanded') === 'true'
      if (expanded) chip.removeAttribute('data-relations-expanded')
      else chip.setAttribute('data-relations-expanded', 'true')
      relationsBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true')
      relationsBtn.setAttribute(
        'aria-label',
        viewerText(expanded ? 'viewer.passport.relations.show' : 'viewer.passport.relations.hide'),
      )
      requestLensPlacement()
    })
    relationshipList.addEventListener('click', function (event) {
      const button = event.target.closest('[data-relationship-target]')
      if (!button) return
      const id = button.getAttribute('data-relationship-target')
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, updateUrl: false })
      }
      set(id, { toggle: false })
      if (Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal([id], { includeNeighbors: true, reason: 'relationship' })
      }
      const node = svg.querySelector('[data-node-id="' + id + '"]')
      if (node) {
        try {
          node.focus({ preventScroll: true })
        } catch (_) {
          reportArchifyFailure(_)
          try {
            node.focus()
          } catch (_2) {
            reportArchifyFailure(_2)
          }
        }
      }
    })
    relationshipList.addEventListener('pointerover', function (event) {
      if (event.pointerType === 'touch') return
      if (finePointerQuery && !finePointerQuery.matches) return
      const button = event.target.closest('[data-relationship-key]')
      if (!button || !relationshipList.contains(button)) return
      if (event.relatedTarget && button.contains(event.relatedTarget)) return
      hoveredRelationship = button
      syncRelationshipPreview()
    })
    relationshipList.addEventListener('pointerout', function (event) {
      const button = event.target.closest('[data-relationship-key]')
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return
      if (hoveredRelationship === button) hoveredRelationship = null
      syncRelationshipPreview()
    })
    relationshipList.addEventListener('focusin', function (event) {
      const button = event.target.closest('[data-relationship-key]')
      if (!button) return
      focusedRelationship = button
      syncRelationshipPreview()
    })
    relationshipList.addEventListener('focusout', function (event) {
      const button = event.target.closest('[data-relationship-key]')
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return
      if (focusedRelationship === button) focusedRelationship = null
      syncRelationshipPreview()
    })
    relationshipList.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
      const buttons = Array.prototype.slice.call(relationshipList.querySelectorAll('[data-relationship-target]'))
      if (!buttons.length) return
      let index = buttons.indexOf(document.activeElement)
      if (event.key === 'Home') index = 0
      else if (event.key === 'End') index = buttons.length - 1
      else if (event.key === 'ArrowDown') index = Math.min(buttons.length - 1, Math.max(0, index + 1))
      else index = Math.max(0, index < 0 ? 0 : index - 1)
      event.preventDefault()
      buttons[index].focus()
    })
    document.addEventListener(
      'click',
      function (event) {
        const target = event.target
        if (chip.hidden || !target || typeof target.closest !== 'function' || chip.contains(target)) return
        if (container.getAttribute('data-just-panned') === 'true') return
        if (target.closest('[data-node-id], [data-relationship-hit-key], .overview-map')) return
        clear()
      },
      true,
    )
    browser.addEventListener('scroll', requestLensPlacement, { passive: true })
    browser.addEventListener('resize', requestLensPlacement)
    container.addEventListener('scroll', requestLensPlacement, { passive: true })
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) removeRelationshipPulse()
    })
    function syncRelationshipMotionPreference(event) {
      if (event.matches) removeRelationshipPulse()
    }
    if (reducedMotionQuery) {
      if (typeof reducedMotionQuery.addEventListener === 'function') {
        reducedMotionQuery.addEventListener('change', syncRelationshipMotionPreference)
      } else if (typeof reducedMotionQuery.addListener === 'function') {
        reducedMotionQuery.addListener(syncRelationshipMotionPreference)
      }
    }
    installRelationshipHitTargets()
    function syncFocusFromHash() {
      try {
        const params = new URLSearchParams(location.hash.replace(/^#/, ''))
        const relation = params.get('relation')
        const initial = params.get('focus')
        const reach = params.get('reach')
        if (relation) {
          if (
            html.getAttribute('data-embed') === 'true' ||
            !inspectRelationshipById(relation, { toggle: false, updateUrl: false })
          )
            clear({ updateUrl: false })
        } else if (initial) {
          if (set(initial, { toggle: false, updateUrl: false }) && (reach === 'upstream' || reach === 'downstream')) {
            applyReachability(reach, { reveal: false, toggle: false, updateUrl: false })
          }
        } else if (!params.get('view')) clear({ updateUrl: false })
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    browser.addEventListener('hashchange', syncFocusFromHash)
    syncFocusFromHash()
    return {
      active: function () {
        return activeIds.length === 0 ? null : activeIds.length === 1 ? activeIds[0] : activeIds.slice()
      },
      clear,
      clearReach: clearReachability,
      copyLink: copyFocusLink,
      inspectRelationship,
      inspectRelationshipById,
      reach: applyReachability,
      reachability: function () {
        return activeReachability
          ? {
              direction: activeReachability.direction,
              edgeKeys: activeReachability.edgeKeys.slice(),
              maxDepth: activeReachability.maxDepth,
              nodeIds: activeReachability.nodeIds.slice(),
              originId: activeReachability.originId,
            }
          : null
      },
      reachabilitySnapshot,
      relationship: function () {
        const record = pinnedRelationshipRecord()
        return record
          ? { from: record.from, id: record.id || null, key: record.key, label: record.label, to: record.to }
          : null
      },
      reposition: requestLensPlacement,
      set,
      setMany,
    }
  })()
  Archify.intentTrace = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector(':scope > svg')
    const status = document.getElementById('intent-trace-status')
    const namespace = 'http://www.w3.org/2000/svg'
    let activeId = null
    let hoveredNode = null
    let focusedNode = null
    let enterTimer = null
    function nodes() {
      return Array.prototype.slice.call(svg.querySelectorAll('[data-node-id]'))
    }
    function edges() {
      return Array.prototype.slice.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'))
    }
    function nodeLabel(node, fallback) {
      return (
        node.getAttribute('data-node-label') ||
        (node.getAttribute('aria-label') || fallback).replace(/^Focus\s+/, '').split(',')[0]
      )
    }
    function finePointer() {
      return !browser.matchMedia || browser.matchMedia('(hover: hover) and (pointer: fine)').matches
    }
    function reducedMotion() {
      return !!(browser.matchMedia && browser.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
    function blocked() {
      return (
        html.getAttribute('data-embed') === 'true' ||
        html.getAttribute('data-guide-open') === 'true' ||
        container.classList.contains('is-panning') ||
        svg.hasAttribute('data-lens-active') ||
        svg.hasAttribute('data-story-active') ||
        svg.hasAttribute('data-relationship-preview-active') ||
        !!(Archify.routeProbe && typeof Archify.routeProbe.active === 'function' && Archify.routeProbe.active()) ||
        !!(Archify.focus && typeof Archify.focus.active === 'function' && Archify.focus.active())
      )
    }
    function edgeShapes(edge) {
      if (/^(path|line|polyline)$/i.test(edge.tagName)) return [edge]
      return Array.prototype.slice.call(edge.querySelectorAll('path, line, polyline'))
    }
    function removeOverlay() {
      Array.prototype.forEach.call(svg.querySelectorAll('[data-intent-trace-overlay]'), function (overlay) {
        overlay.remove()
      })
    }
    function clear(options) {
      options = options || {}
      if (enterTimer) browser.clearTimeout(enterTimer)
      enterTimer = null
      activeId = null
      svg.removeAttribute('data-intent-trace-active')
      removeOverlay()
      nodes().forEach(function (node) {
        node.removeAttribute('data-intent-trace-match')
        node.removeAttribute('data-intent-trace-selected')
      })
      edges().forEach(function (edge) {
        edge.removeAttribute('data-intent-trace-match')
      })
      if (options.announce !== false) status.textContent = ''
    }
    function traceGeometry(shape, direction) {
      const clone = shape.cloneNode(false)
      clone.removeAttribute('id')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.removeAttribute('marker-start')
      clone.removeAttribute('marker-mid')
      clone.removeAttribute('marker-end')
      clone.removeAttribute('role')
      clone.removeAttribute('aria-label')
      clone.removeAttribute('aria-labelledby')
      clone.removeAttribute('data-animate')
      clone.removeAttribute('data-edge-from')
      clone.removeAttribute('data-edge-to')
      clone.removeAttribute('data-edge-key')
      clone.removeAttribute('data-edge-id')
      clone.removeAttribute('data-edge-label')
      clone.removeAttribute('data-intent-trace-match')
      clone.removeAttribute('data-intent-trace-selected')
      clone.setAttribute('class', 'intent-trace-flow')
      clone.setAttribute('data-direction', direction)
      clone.setAttribute('pathLength', '1')
      return clone
    }
    function show(id, options) {
      options = options || {}
      if (!id || blocked()) {
        clear({ announce: false })
        return false
      }
      if (activeId === id) return true
      clear({ announce: false })
      const nodeList = nodes()
      const edgeList = edges()
      const byId = {}
      nodeList.forEach(function (node) {
        byId[node.getAttribute('data-node-id')] = node
      })
      const selected = byId[id]
      if (!selected) return false
      const overlay = document.createElementNS(namespace, 'g')
      overlay.setAttribute('class', 'intent-trace-overlay')
      overlay.setAttribute('data-intent-trace-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      const related = {}
      const seen = {}
      const counts = { in: 0, loop: 0, out: 0 }
      related[id] = true
      edgeList.forEach(function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        if (from !== id && to !== id) return
        const direction = from === id && to === id ? 'loop' : from === id ? 'out' : 'in'
        const key =
          edge.getAttribute('data-edge-key') || from + '\0' + to + '\0' + (edge.getAttribute('data-edge-label') || '')
        if (!seen[key]) {
          seen[key] = true
          counts[direction] += 1
        }
        related[from] = true
        related[to] = true
        edge.setAttribute('data-intent-trace-match', '')
        const wrapper = document.createElementNS(namespace, 'g')
        if (edge.hasAttribute('transform')) wrapper.setAttribute('transform', edge.getAttribute('transform'))
        edgeShapes(edge).forEach(function (shape) {
          wrapper.appendChild(traceGeometry(shape, direction))
        })
        if (wrapper.childNodes.length) overlay.appendChild(wrapper)
      })
      nodeList.forEach(function (node) {
        const nodeId = node.getAttribute('data-node-id')
        if (related[nodeId]) node.setAttribute('data-intent-trace-match', '')
        if (nodeId === id) node.setAttribute('data-intent-trace-selected', '')
      })
      if (overlay.childNodes.length) {
        const firstEdge = edgeList[0]
        const firstNode = svg.querySelector('[data-node-id]')
        if (firstEdge && firstEdge.parentNode) firstEdge.parentNode.insertBefore(overlay, firstEdge)
        else if (firstNode) svg.insertBefore(overlay, firstNode)
        else svg.appendChild(overlay)
      }
      activeId = id
      svg.setAttribute('data-intent-trace-active', id)
      if (options.announce === true) {
        const total = counts.out + counts.in + counts.loop
        status.textContent = viewerText('viewer.intent.summary', {
          in: counts.in,
          label: nodeLabel(selected, id),
          loops: counts.loop ? viewerText('viewer.intent.loops', { count: counts.loop }) : '',
          out: counts.out,
          total,
        })
      }
      return true
    }
    function schedule(node) {
      if (enterTimer) browser.clearTimeout(enterTimer)
      enterTimer = browser.setTimeout(
        function () {
          enterTimer = null
          if (hoveredNode === node) show(node.getAttribute('data-node-id'), { announce: false })
        },
        reducedMotion() ? 0 : 90,
      )
    }
    function sync() {
      const candidate = focusedNode || hoveredNode
      if (!candidate) {
        clear()
        return
      }
      show(candidate.getAttribute('data-node-id'), { announce: candidate === focusedNode })
    }
    svg.addEventListener('pointerover', function (event) {
      const node = event.target.closest('[data-node-id]')
      if (!node || !finePointer() || event.pointerType === 'touch') return
      if (event.relatedTarget && node.contains(event.relatedTarget)) return
      hoveredNode = node
      schedule(node)
    })
    svg.addEventListener('pointerout', function (event) {
      const node = event.target.closest('[data-node-id]')
      if (!node || (event.relatedTarget && node.contains(event.relatedTarget))) return
      if (hoveredNode === node) hoveredNode = null
      sync()
    })
    svg.addEventListener('focusin', function (event) {
      const node = event.target.closest('[data-node-id]')
      if (!node) return
      focusedNode = node
      show(node.getAttribute('data-node-id'), { announce: true })
    })
    svg.addEventListener('focusout', function (event) {
      const node = event.target.closest('[data-node-id]')
      if (!node || (event.relatedTarget && node.contains(event.relatedTarget))) return
      if (focusedNode === node) focusedNode = null
      sync()
    })
    container.addEventListener('pointerdown', function (event) {
      if (!event.target.closest('[data-node-id]')) clear({ announce: false })
    })
    browser.addEventListener('blur', function () {
      clear({ announce: false })
    })
    return {
      active: function () {
        return activeId
      },
      clear,
      show,
    }
  })()
  Archify.guidedViews = (function () {
    const data = document.getElementById(ARCHIFY_CONTRACT.element.guidedViewsData)
    const panel = document.getElementById('guided-views')
    const prev = document.getElementById('guided-view-prev')
    const next = document.getElementById('guided-view-next')
    const all = document.getElementById('guided-view-all')
    const play = document.getElementById('guided-view-play')
    const playIcon = document.getElementById('guided-view-play-icon')
    const playLabel = document.getElementById('guided-view-play-label')
    const beatLink = document.getElementById('guided-view-beat-link')
    const beatLinkLabel = document.getElementById('guided-view-beat-link-label')
    const progressBar = document.getElementById('guided-view-progress-bar')
    const count = document.getElementById('guided-view-count')
    const handoffReceipt = document.getElementById('guided-view-handoff')
    const label = document.getElementById('guided-view-label')
    const note = document.getElementById('guided-view-note')
    const trail = document.getElementById('guided-view-trail')
    const storyCaption = document.getElementById('guided-story-caption')
    const storyCaptionIndex = document.getElementById('guided-story-caption-index')
    const storyCaptionRoute = document.getElementById('guided-story-caption-route')
    const storyCaptionDetail = document.getElementById('guided-story-caption-detail')
    const storyCaptionNext = document.getElementById('guided-story-caption-next')
    const storyCaptionNextLabel = document.getElementById('guided-story-caption-next-label')
    const chapterIndex = document.getElementById('guided-view-index')
    const chapterList = document.getElementById('guided-view-chapters')
    const shareCue = document.getElementById('share-chapter-cue')
    const shareCueState = document.getElementById('share-chapter-state')
    const shareCueCount = document.getElementById('share-chapter-count')
    const shareCueLabel = document.getElementById('share-chapter-label')
    const shareCueNote = document.getElementById('share-chapter-note')
    const shareCueRoute = document.getElementById('share-chapter-route')
    const shareCueProgress = document.getElementById('share-chapter-progress-bar')
    const svg = document.querySelector('.diagram-container svg')
    let views = []
    let activeIndex = -1
    let playing = false
    let storyBeatTimer = null
    let storyBeatIndex = -1
    let storyBeatStartedAt = 0
    let storyBeatElapsedMs = 0
    let storyBeatDwellMs = 0
    let storyPlaybackGeneration = 0
    let storyFollowGeneration = 0
    let storyPlaybackScope = 'story'
    let storyPlaybackComplete = false
    let beatLinkFeedbackTimer = null
    let momentRestoreGeneration = 0
    let storySteps = []
    let storyPulseOwnerToken = 0
    let storyPulseGeneration = 0
    let autoplayPending = false
    const VIEW_INTERVAL_MS = 3200
    const STORY_FOLLOW_MIN_DWELL_MS = 1100
    const STORY_FOLLOW_DURATION_MS = 320
    let chapterButtons = []
    let handoffGeneration = 0
    let currentHandoff = null
    let previewGeneration = 0
    let pointerPreviewIntent = null
    let focusPreviewIntent = null
    let activePreviewIndex = -1
    let previewOwnerToken = 0
    try {
      views = JSON.parse(data.textContent || '[]')
    } catch (_) {
      reportArchifyFailure(_)
      views = []
    }
    if (!views.length)
      return {
        active: function () {
          return null
        },
        count: 0,
      }
    const canonicalNodeIds = {}
    Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
      canonicalNodeIds[node.getAttribute('data-node-id')] = true
    })
    views.forEach(function (view) {
      const seen = {}
      view.focus = (view.focus || []).filter(function (id) {
        if (!canonicalNodeIds[id] || seen[id]) return false
        seen[id] = true
        return true
      })
    })
    panel.setAttribute('data-active-view', 'all')
    panel.hidden = false
    panel.setAttribute('data-view-interval-ms', String(VIEW_INTERVAL_MS))
    panel.setAttribute('data-story-follow-min-dwell-ms', String(STORY_FOLLOW_MIN_DWELL_MS))
    buildChapterIndex()
    function reducedMotion() {
      return !!(browser.matchMedia && browser.matchMedia('(prefers-reduced-motion: reduce)').matches)
    }
    function findNode(id) {
      return (
        Array.prototype.find.call(svg.querySelectorAll('[data-node-id]'), function (node) {
          return node.getAttribute('data-node-id') === id
        }) || null
      )
    }
    function chapterDelta(previous, destination) {
      const previousFocus = previous ? previous.focus : []
      const destinationFocus = destination ? destination.focus : []
      const previousIds = {}
      const destinationIds = {}
      previousFocus.forEach(function (id) {
        previousIds[id] = true
      })
      destinationFocus.forEach(function (id) {
        destinationIds[id] = true
      })
      return {
        enter: destinationFocus.filter(function (id) {
          return !previousIds[id]
        }),
        leave: previousFocus.filter(function (id) {
          return !destinationIds[id]
        }),
        stay: previousFocus.filter(function (id) {
          return destinationIds[id]
        }),
      }
    }
    function chapterAnchor(previous, destination, outgoingBeatIndex, delta) {
      if (!previous || !destination) return ''
      const stayIds = {}
      delta.stay.forEach(function (id) {
        stayIds[id] = true
      })
      const activeBeat = outgoingBeatIndex >= 0 ? previous.focus[outgoingBeatIndex] : ''
      if (activeBeat && stayIds[activeBeat]) return activeBeat
      for (let index = previous.focus.length - 1; index >= 0; index -= 1) {
        if (stayIds[previous.focus[index]]) return previous.focus[index]
      }
      return ''
    }
    function handoffMotionAllowed() {
      if (document.hidden || reducedMotion()) return false
      if (document.documentElement.getAttribute('data-embed') === 'true') return false
      if (browser.matchMedia && browser.matchMedia('print').matches) return false
      return !(Archify.motionGovernor && Archify.motionGovernor.capable && Archify.motionGovernor.isPaused())
    }
    function classifyHandoff(delta, anchor) {
      const roles = {}
      delta.stay.forEach(function (id) {
        roles[id] = 'stay'
      })
      delta.enter.forEach(function (id) {
        roles[id] = 'enter'
      })
      delta.leave.forEach(function (id) {
        roles[id] = 'leave'
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
        const id = node.getAttribute('data-node-id')
        const role = roles[id] || ''
        if (role) node.setAttribute('data-chapter-role', role)
        else node.removeAttribute('data-chapter-role')
      })
      svg.setAttribute('data-chapter-handoff', anchor ? 'anchor' : 'no-anchor')
      if (anchor) svg.setAttribute('data-chapter-anchor', anchor)
      else svg.removeAttribute('data-chapter-anchor')
    }
    function drawHandoffAnchor(id) {
      const node = findNode(id)
      if (!node) return null
      let box
      try {
        box = node.getBBox()
      } catch (_) {
        reportArchifyFailure(_)
        return null
      }
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      overlay.setAttribute('class', 'chapter-handoff-overlay')
      overlay.setAttribute('data-chapter-handoff-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      ring.setAttribute('class', 'chapter-handoff-anchor')
      ring.setAttribute('x', String(box.x - 8))
      ring.setAttribute('y', String(box.y - 8))
      ring.setAttribute('width', String(box.width + 16))
      ring.setAttribute('height', String(box.height + 16))
      ring.setAttribute('rx', '10')
      overlay.appendChild(ring)
      svg.appendChild(overlay)
      return overlay
    }
    function clearHandoffPresentation() {
      svg.removeAttribute('data-chapter-handoff')
      svg.removeAttribute('data-chapter-anchor')
      Array.prototype.forEach.call(svg.querySelectorAll('[data-chapter-handoff-overlay]'), function (overlay) {
        overlay.remove()
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-chapter-role]'), function (node) {
        node.removeAttribute('data-chapter-role')
      })
      if (handoffReceipt) {
        handoffReceipt.hidden = true
        handoffReceipt.textContent = ''
      }
    }
    function completeHandoff(handoff, outcome) {
      if (!handoff || currentHandoff !== handoff) return false
      if (handoff.holdTimer) clearTimeout(handoff.holdTimer)
      handoff.holdTimer = null
      currentHandoff = null
      clearHandoffPresentation()
      if (handoff.ownerToken && Archify.motionGovernor) Archify.motionGovernor.release(handoff.ownerToken)
      handoff.resolve({ anchor: handoff.anchor || null, id: handoff.id, state: outcome || 'complete' })
      syncStoryControlsDisabled()
      syncChapterPreview()
      return true
    }
    function settleHandoff(reason) {
      const handoff = currentHandoff
      if (!handoff) return false
      if (handoff.holdTimer) clearTimeout(handoff.holdTimer)
      handoff.holdTimer = null
      if (handoff.camera && handoff.camera.cancel) handoff.camera.cancel(reason || 'settled', true)
      else if (Archify.view && Archify.view.reveal)
        Archify.view.reveal(handoff.focus, { instant: true, reason: reason || 'settled' })
      completeHandoff(handoff, reason || 'settled')
      return true
    }
    function cancelHandoff(reason) {
      const handoff = currentHandoff
      if (!handoff) return false
      if (handoff.holdTimer) clearTimeout(handoff.holdTimer)
      handoff.holdTimer = null
      if (handoff.camera && handoff.camera.cancel) handoff.camera.cancel(reason || 'manual', false)
      completeHandoff(handoff, reason || 'manual')
      return true
    }
    function afterHandoff(callback) {
      if (!currentHandoff) {
        callback()
        return
      }
      currentHandoff.finished.then(callback)
    }
    function beginHandoff(previousIndex, nextIndex, previous, destination, outgoingBeatIndex, reason) {
      if (!Archify.view || !Archify.view.reveal) return null
      if (!previous || previousIndex === nextIndex) {
        Archify.view.reveal(destination.focus, { reason })
        return null
      }
      const delta = chapterDelta(previous, destination)
      const anchor = chapterAnchor(previous, destination, outgoingBeatIndex, delta)
      if (!handoffMotionAllowed()) {
        Archify.view.reveal(destination.focus, { instant: true, reason })
        return null
      }
      let resolver
      const handoff = {
        anchor,
        camera: null,
        finished: new Promise(function (resolve) {
          resolver = resolve
        }),
        focus: destination.focus.slice(),
        holdTimer: null,
        id: ++handoffGeneration,
        mode: anchor ? 'holding' : 'no-anchor',
        ownerToken: 0,
        resolve: resolver,
      }
      currentHandoff = handoff
      classifyHandoff(delta, anchor)
      if (anchor) {
        drawHandoffAnchor(anchor)
        const node = findNode(anchor)
        const nodeLabel = node ? node.getAttribute('data-node-label') || anchor : anchor
        handoffReceipt.textContent = viewerText('viewer.guided.handoff', {
          from: (previousIndex + 1 < 10 ? '0' : '') + (previousIndex + 1),
          label: nodeLabel,
          to: (nextIndex + 1 < 10 ? '0' : '') + (nextIndex + 1),
        })
        handoffReceipt.hidden = false
      }
      if (Archify.motionGovernor) {
        handoff.ownerToken = Archify.motionGovernor.claim('handoff', function () {
          if (currentHandoff === handoff) settleHandoff('preempted')
        })
      }
      const startCamera = function () {
        if (currentHandoff !== handoff) return
        handoff.holdTimer = null
        handoff.mode = 'settling'
        svg.setAttribute('data-chapter-handoff', anchor ? 'settling' : 'no-anchor')
        handoff.camera = Archify.view.reveal(destination.focus, { duration: 420, reason })
        if (handoff.camera && handoff.camera.finished) {
          handoff.camera.finished.then(function (outcome) {
            if (currentHandoff === handoff) completeHandoff(handoff, (outcome && outcome.state) || 'complete')
          })
        } else {
          completeHandoff(handoff, 'complete')
        }
      }
      if (anchor) handoff.holdTimer = setTimeout(startCamera, 110)
      else startCamera()
      return handoff
    }
    function centerChapterButton(button) {
      if (!button || !chapterList) return false
      const target = Math.max(0, button.offsetLeft - (chapterList.clientWidth - button.offsetWidth) / 2)
      if (typeof chapterList.scrollTo === 'function') chapterList.scrollTo({ behavior: 'auto', left: target })
      else chapterList.scrollLeft = target
      return true
    }
    function focusChapterButton(index) {
      if (!chapterButtons.length) return false
      index = Math.max(0, Math.min(chapterButtons.length - 1, index))
      chapterButtons.forEach(function (button, buttonIndex) {
        button.setAttribute('tabindex', buttonIndex === index ? '0' : '-1')
      })
      chapterButtons[index].focus()
      centerChapterButton(chapterButtons[index])
      return true
    }
    function buildChapterIndex() {
      chapterButtons = []
      chapterList.textContent = ''
      views.forEach(function (view, index) {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'guided-view-chapter'
        button.setAttribute('data-guided-view-id', view.id)
        button.setAttribute('aria-pressed', 'false')
        button.setAttribute('tabindex', index === 0 ? '0' : '-1')
        button.setAttribute(
          'aria-label',
          viewerText('viewer.guided.chapter.open', {
            count: view.focus.length,
            index: index + 1,
            label: view.label,
            total: views.length,
          }),
        )
        button.title =
          view.label +
          ' \u2014 ' +
          (view.note || viewerText('viewer.guided.chapter.selectedNodes', { count: view.focus.length }))
        const position = document.createElement('span')
        position.className = 'guided-view-chapter-index'
        position.setAttribute('aria-hidden', 'true')
        position.textContent = (index + 1 < 10 ? '0' : '') + (index + 1)
        const title = document.createElement('span')
        title.className = 'guided-view-chapter-title'
        title.textContent = view.label
        const stops = document.createElement('em')
        stops.className = 'guided-view-chapter-count'
        stops.textContent = viewerCount('viewer.guided.chapter.stop', view.focus.length)
        const delta = document.createElement('span')
        delta.className = 'guided-view-chapter-delta'
        delta.hidden = true
        delta.setAttribute('aria-hidden', 'true')
        ;['stay', 'enter', 'leave'].forEach(function (kind) {
          const value = document.createElement('span')
          value.setAttribute('data-delta-kind', kind)
          delta.appendChild(value)
        })
        button.appendChild(position)
        button.appendChild(title)
        button.appendChild(stops)
        button.appendChild(delta)
        item.appendChild(button)
        chapterList.appendChild(item)
        chapterButtons.push(button)
      })
    }
    function syncChapterIndex() {
      chapterButtons.forEach(function (button, index) {
        const current = index === activeIndex
        const stops = button.querySelector('.guided-view-chapter-count')
        const deltaLabel = button.querySelector('.guided-view-chapter-delta')
        const position = activeIndex < 0 ? 'available' : current ? 'current' : index < activeIndex ? 'before' : 'after'
        button.setAttribute('data-chapter-position', position)
        button.setAttribute('aria-pressed', current ? 'true' : 'false')
        button.setAttribute('tabindex', current || (activeIndex < 0 && index === 0) ? '0' : '-1')
        if (current) {
          stops.hidden = false
          deltaLabel.hidden = true
          button.removeAttribute('data-chapter-delta')
          button.setAttribute(
            'aria-label',
            viewerText('viewer.guided.chapter.current', {
              count: views[index].focus.length,
              index: index + 1,
              label: views[index].label,
              total: views.length,
            }),
          )
          button.title = viewerText('viewer.guided.chapter.current.title', {
            count: views[index].focus.length,
            label: views[index].label,
          })
        } else {
          const delta = chapterDelta(activeIndex >= 0 ? views[activeIndex] : null, views[index])
          const compact = '=' + delta.stay.length + ' +' + delta.enter.length + ' \u2212' + delta.leave.length
          const expanded = viewerText('viewer.guided.chapter.delta.expanded', {
            enter: delta.enter.length,
            leave: delta.leave.length,
            stay: delta.stay.length,
          })
          stops.hidden = true
          deltaLabel.hidden = false
          deltaLabel.querySelector('[data-delta-kind="stay"]').textContent = '=' + delta.stay.length
          deltaLabel.querySelector('[data-delta-kind="enter"]').textContent = '+' + delta.enter.length
          deltaLabel.querySelector('[data-delta-kind="leave"]').textContent = '\u2212' + delta.leave.length
          button.setAttribute('data-chapter-delta', compact)
          button.setAttribute(
            'aria-label',
            viewerText('viewer.guided.chapter.delta.aria', {
              delta: expanded,
              index: index + 1,
              label: views[index].label,
              total: views.length,
            }),
          )
          button.title = viewerText('viewer.guided.chapter.delta.title', {
            delta: compact,
            label: views[index].label,
          })
        }
        if (current) button.setAttribute('aria-current', 'step')
        else button.removeAttribute('aria-current')
        if (button.parentElement) button.parentElement.setAttribute('data-chapter-position', position)
      })
      if (activeIndex >= 0) centerChapterButton(chapterButtons[activeIndex])
    }
    function chapterPreviewBlocked() {
      if (document.hidden || playing || currentHandoff) return true
      if (document.documentElement.getAttribute('data-embed') === 'true') return true
      if (browser.matchMedia && browser.matchMedia('print').matches) return true
      if (svg.hasAttribute('data-route-picking') || svg.hasAttribute('data-route-active')) return true
      if (svg.hasAttribute('data-lens-active') || svg.hasAttribute('data-legend-preview-active')) return true
      if (svg.hasAttribute('data-relationship-preview-active') || svg.hasAttribute('data-intent-trace-active'))
        return true
      return activeIndex < 0 && svg.hasAttribute('data-focus-active')
    }
    function clearChapterPreviewPresentation() {
      svg.removeAttribute('data-chapter-preview')
      Array.prototype.forEach.call(svg.querySelectorAll('[data-chapter-preview-role]'), function (node) {
        node.removeAttribute('data-chapter-preview-role')
      })
      chapterButtons.forEach(function (button) {
        button.removeAttribute('data-preview-active')
      })
      activePreviewIndex = -1
      if (previewOwnerToken && Archify.motionGovernor) {
        const token = previewOwnerToken
        previewOwnerToken = 0
        Archify.motionGovernor.release(token)
      }
    }
    function clearChapterPreview(options) {
      options = options || {}
      previewGeneration += 1
      if (options.clearIntents !== false) {
        pointerPreviewIntent = null
        focusPreviewIntent = null
      }
      clearChapterPreviewPresentation()
      return true
    }
    function winningChapterPreviewIntent() {
      return (
        [pointerPreviewIntent, focusPreviewIntent]
          .filter(function (intent) {
            return intent && intent.index >= 0 && intent.index < views.length && intent.index !== activeIndex
          })
          .sort(function (left, right) {
            return right.generation - left.generation
          })[0] || null
      )
    }
    function showChapterPreview(index) {
      if (index < 0 || index >= views.length || index === activeIndex || chapterPreviewBlocked()) {
        clearChapterPreviewPresentation()
        return false
      }
      if (activePreviewIndex === index && svg.getAttribute('data-chapter-preview') === views[index].id) return true
      clearChapterPreviewPresentation()
      const delta = chapterDelta(activeIndex >= 0 ? views[activeIndex] : null, views[index])
      const roles = {}
      delta.stay.forEach(function (id) {
        roles[id] = 'stay'
      })
      delta.enter.forEach(function (id) {
        roles[id] = 'enter'
      })
      delta.leave.forEach(function (id) {
        roles[id] = 'leave'
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id]'), function (node) {
        const role = roles[node.getAttribute('data-node-id')]
        if (role) node.setAttribute('data-chapter-preview-role', role)
      })
      svg.setAttribute('data-chapter-preview', views[index].id)
      chapterButtons[index].setAttribute('data-preview-active', 'true')
      activePreviewIndex = index
      if (Archify.motionGovernor && Archify.motionGovernor.capable) {
        previewOwnerToken = Archify.motionGovernor.claim('chapter-preview', function () {
          previewOwnerToken = 0
          clearChapterPreviewPresentation()
        })
      }
      return true
    }
    function syncChapterPreview() {
      const intent = winningChapterPreviewIntent()
      if (!intent || chapterPreviewBlocked()) {
        clearChapterPreviewPresentation()
        return false
      }
      return showChapterPreview(intent.index)
    }
    function setChapterPreviewIntent(source, index) {
      const intent = { generation: ++previewGeneration, index }
      if (source === 'pointer') pointerPreviewIntent = intent
      else focusPreviewIntent = intent
      if (playing) pausePlayback()
      return syncChapterPreview()
    }
    function clearChapterPreviewIntent(source, index) {
      const intent = source === 'pointer' ? pointerPreviewIntent : focusPreviewIntent
      if (intent && (typeof index !== 'number' || intent.index === index)) {
        if (source === 'pointer') pointerPreviewIntent = null
        else focusPreviewIntent = null
        previewGeneration += 1
      }
      return syncChapterPreview()
    }
    function hoverCapable() {
      return !!(browser.matchMedia && browser.matchMedia('(hover: hover)').matches)
    }
    function sharePlaybackRequested() {
      try {
        return new URLSearchParams(location.search).get('play') === '1'
      } catch (_) {
        reportArchifyFailure(_)
        return false
      }
    }
    autoplayPending = sharePlaybackRequested()
    if (autoplayPending) {
      document.documentElement.setAttribute('data-share-playback', 'true')
      setAutoplayState('pending')
    }
    function setAutoplayState(state) {
      if (state) panel.setAttribute('data-autoplay', state)
      else panel.removeAttribute('data-autoplay')
      renderShareCue()
    }
    function shareCueStatus(state) {
      return (
        {
          complete: viewerText('viewer.guided.state.settled'),
          interrupted: viewerText('viewer.guided.state.paused'),
          pending: viewerText('viewer.guided.state.ready'),
          pinned: viewerText('viewer.guided.state.pinned'),
          playing: viewerText('viewer.guided.state.playing'),
          'reduced-motion': viewerText('viewer.guided.state.still'),
        }[state] || viewerText('viewer.guided.state.ready')
      )
    }
    function shareCueBeatCopy(state, view, stops) {
      const total = stops.length
      const activeStop = storyBeatIndex >= 0 ? stops[storyBeatIndex] : null
      if ((state === 'playing' || state === 'interrupted') && activeStop) {
        return viewerText('viewer.guided.share.step', {
          index: (storyBeatIndex + 1 < 10 ? '0' : '') + (storyBeatIndex + 1),
          label: activeStop.textContent,
          total: (total < 10 ? '0' : '') + total,
        })
      }
      if (state === 'pinned' && activeStop) {
        return storyBeatCopy(storySteps[storyBeatIndex], total)
      }
      if (state === 'reduced-motion' && activeStop && hashBeatMatchesCurrent()) {
        return viewerText('viewer.guided.share.staticMoment', {
          step: viewerText('viewer.guided.share.step', {
            index: (storyBeatIndex + 1 < 10 ? '0' : '') + (storyBeatIndex + 1),
            label: activeStop.textContent,
            total: (total < 10 ? '0' : '') + total,
          }),
        })
      }
      if (state === 'complete')
        return viewerText('viewer.guided.share.complete', {
          count: total,
          note: view.note || viewerText('viewer.guided.share.settled'),
        })
      if (state === 'reduced-motion') return viewerText('viewer.guided.share.staticPath', { count: total })
      if (state === 'pending') return viewerText('viewer.guided.share.ready', { count: total })
      return view.note || viewerText('viewer.guided.chapter.selectedNodes', { count: view.focus.length })
    }
    function renderShareCue() {
      if (!shareCue) return
      const view = activeIndex >= 0 ? views[activeIndex] : null
      const shareMode = document.documentElement.getAttribute('data-share-playback') === 'true'
      const embedMode = document.documentElement.getAttribute('data-embed') === 'true'
      const pinnedMode = !shareMode && embedMode && hashBeatMatchesCurrent()
      if (pinnedMode) document.documentElement.setAttribute('data-share-moment', 'true')
      else document.documentElement.removeAttribute('data-share-moment')
      shareCue.hidden = !(embedMode && view && (shareMode || pinnedMode))
      if (shareCue.hidden) return
      const state = pinnedMode ? 'pinned' : panel.getAttribute('data-autoplay') || 'pending'
      const stops = Array.prototype.slice.call(trail.querySelectorAll('[data-story-node]'))
      const route = stops
        .map(function (stop, index) {
          if (index === 0) return stop.textContent
          const kind = stop.getAttribute('data-story-link')
          const separator =
            kind === 'forward' ? '\u2192' : kind === 'reverse' ? '\u2190' : kind === 'multiple' ? '\u21C4' : '\xB7'
          return separator + ' ' + stop.textContent
        })
        .join(' ')
      const beatCopy = shareCueBeatCopy(state, view, stops)
      shareCue.setAttribute('data-state', state)
      shareCue.setAttribute('aria-live', state === 'playing' ? 'off' : 'polite')
      shareCueState.textContent = shareCueStatus(state)
      shareCueCount.textContent = viewerText('viewer.guided.share.chapter', {
        index: (activeIndex + 1 < 10 ? '0' : '') + (activeIndex + 1),
        total: (views.length < 10 ? '0' : '') + views.length,
      })
      shareCueLabel.textContent = view.label
      shareCueNote.textContent = beatCopy
      shareCueRoute.textContent = route
      shareCue.setAttribute(
        'aria-label',
        viewerText('viewer.guided.share.aria', {
          beat: beatCopy,
          index: activeIndex + 1,
          label: view.label,
          route,
          state: shareCueStatus(state),
          total: views.length,
        }),
      )
    }
    function setShareCueProgress(fraction) {
      if (!shareCueProgress) return
      shareCueProgress.style.animation = 'none'
      shareCueProgress.style.setProperty('--guided-progress-start', String(Math.max(0, Math.min(1, fraction))))
      shareCueProgress.style.transform = 'scaleX(' + Math.max(0, Math.min(1, fraction)) + ')'
    }
    function startShareCueProgress(fraction, duration) {
      if (!shareCueProgress) return
      setShareCueProgress(fraction || 0)
      void shareCueProgress.offsetWidth
      shareCueProgress.style.animation =
        'archify-guided-progress ' + Math.max(1, duration || VIEW_INTERVAL_MS) + 'ms linear forwards'
    }
    function storyNodeLabel(node, fallback) {
      if (!node) return fallback
      return (
        node.getAttribute('data-node-label') || (node.getAttribute('aria-label') || fallback).replace(/^Focus\s+/, '')
      )
    }
    function storyEdgeKey(edge) {
      return (
        edge.getAttribute('data-edge-key') ||
        edge.getAttribute('data-edge-from') +
          '\0' +
          edge.getAttribute('data-edge-to') +
          '\0' +
          (edge.getAttribute('data-edge-label') || '')
      )
    }
    function uniqueStoryEdges(edgeList) {
      const positions = {}
      const unique = []
      edgeList.forEach(function (edge) {
        const key = storyEdgeKey(edge)
        if (!Object.prototype.hasOwnProperty.call(positions, key)) {
          positions[key] = unique.length
          unique.push(edge)
          return
        }
        const index = positions[key]
        if (!storyGeometry(unique[index]).length && storyGeometry(edge).length) unique[index] = edge
      })
      return unique
    }
    function storyStep(view, index, edgeList, byId) {
      const id = view.focus[index]
      const node = byId[id]
      const previousId = index > 0 ? view.focus[index - 1] : ''
      let forward = []
      let reverse = []
      if (previousId) {
        edgeList.forEach(function (edge) {
          const from = edge.getAttribute('data-edge-from')
          const to = edge.getAttribute('data-edge-to')
          if (from === previousId && to === id) forward.push(edge)
          else if (from === id && to === previousId) reverse.push(edge)
        })
      }
      forward = uniqueStoryEdges(forward)
      reverse = uniqueStoryEdges(reverse)
      const edges = forward.concat(reverse).sort(function (left, right) {
        return edgeList.indexOf(left) - edgeList.indexOf(right)
      })
      const relation =
        index === 0
          ? 'start'
          : !edges.length
            ? 'group'
            : edges.length === 1 && forward.length === 1
              ? 'forward'
              : edges.length === 1 && reverse.length === 1
                ? 'reverse'
                : 'multiple'
      return {
        context: node ? node.getAttribute('data-node-context') || '' : '',
        edgeKeys: edges.map(storyEdgeKey),
        edgeLabels: edges
          .map(function (edge) {
            return edge.getAttribute('data-edge-label') || ''
          })
          .filter(function (value, edgeIndex, values) {
            return value && values.indexOf(value) === edgeIndex
          }),
        edges,
        index,
        nodeId: id,
        nodeLabel: storyNodeLabel(byId[id], id),
        previousId,
        previousLabel: previousId ? storyNodeLabel(byId[previousId], previousId) : '',
        relation,
        responsibility: node ? node.getAttribute('data-node-sublabel') || '' : '',
      }
    }
    function storyBeatCopy(step, total) {
      if (!step) return ''
      const position = (step.index + 1 < 10 ? '0' : '') + (step.index + 1)
      const countValue = (total < 10 ? '0' : '') + total
      if (step.relation === 'start')
        return viewerText('viewer.guided.beat.start', { index: position, label: step.nodeLabel, total: countValue })
      if (step.relation === 'forward')
        return viewerText('viewer.guided.beat.forward', {
          from: step.previousLabel,
          index: position,
          to: step.nodeLabel,
          total: countValue,
        })
      if (step.relation === 'reverse')
        return viewerText('viewer.guided.beat.reverse', {
          from: step.nodeLabel,
          index: position,
          to: step.previousLabel,
          total: countValue,
        })
      if (step.relation === 'multiple')
        return viewerText('viewer.guided.beat.multiple', {
          count: step.edges.length,
          from: step.previousLabel,
          index: position,
          to: step.nodeLabel,
          total: countValue,
        })
      return viewerText('viewer.guided.beat.group', {
        from: step.previousLabel,
        index: position,
        to: step.nodeLabel,
        total: countValue,
      })
    }
    function storyBeatAria(step, total) {
      const prefix = viewerText('viewer.guided.beat.aria.prefix', {
        index: step.index + 1,
        label: step.nodeLabel,
        total,
      })
      if (step.relation === 'start') return prefix + viewerText('viewer.guided.beat.aria.start')
      if (step.relation === 'forward')
        return prefix + viewerText('viewer.guided.beat.aria.forward', { from: step.previousLabel })
      if (step.relation === 'reverse')
        return prefix + viewerText('viewer.guided.beat.aria.reverse', { from: step.previousLabel, to: step.nodeLabel })
      if (step.relation === 'multiple')
        return (
          prefix +
          viewerText('viewer.guided.beat.aria.multiple', { count: step.edges.length, from: step.previousLabel })
        )
      return prefix + viewerText('viewer.guided.beat.aria.group', { from: step.previousLabel })
    }
    function storyCaptionRouteCopy(step) {
      if (step.relation === 'start') return step.nodeLabel + ' \xB7 ' + viewerText('viewer.guided.caption.start')
      if (step.relation === 'reverse') return step.previousLabel + ' \u2190 ' + step.nodeLabel
      if (step.relation === 'multiple') return step.previousLabel + ' \u21C4 ' + step.nodeLabel
      if (step.relation === 'group') return step.previousLabel + ' \xB7 ' + step.nodeLabel
      return step.previousLabel + ' \u2192 ' + step.nodeLabel
    }
    function storyCaptionDetailCopy(step) {
      const facts = []
      if (step.relation === 'group') facts.push(viewerText('viewer.guided.caption.grouped'))
      else if (step.edgeLabels.length)
        facts.push(
          step.edgeLabels.slice(0, 3).join(' + ') +
            (step.edgeLabels.length > 3
              ? viewerText('viewer.guided.caption.more', { count: step.edgeLabels.length - 3 })
              : ''),
        )
      else if (step.relation === 'reverse') facts.push(viewerText('viewer.guided.caption.reverse'))
      else if (step.relation === 'multiple')
        facts.push(viewerText('viewer.guided.caption.relationships', { count: step.edges.length }))
      else if (step.relation !== 'start') facts.push(viewerText('viewer.guided.caption.relationship'))
      if (step.relation === 'reverse')
        facts.push(viewerText('viewer.guided.caption.direction', { from: step.nodeLabel, to: step.previousLabel }))
      if (step.responsibility) facts.push(step.responsibility)
      if (step.context) facts.push(step.context)
      if (!facts.length) facts.push(viewerText('viewer.guided.caption.starting'))
      return facts.join(' \xB7 ')
    }
    function renderStoryCaption(step, total, nextStep) {
      if (!storyCaption) return
      if (!step) {
        storyCaption.hidden = true
        storyCaption.removeAttribute('data-story-caption')
        storyCaptionNext.hidden = true
        storyCaptionNextLabel.textContent = ''
        return
      }
      storyCaption.hidden = false
      storyCaption.setAttribute('data-story-caption', step.relation)
      storyCaption.setAttribute('aria-live', playing ? 'off' : 'polite')
      storyCaptionIndex.textContent =
        (step.index + 1 < 10 ? '0' : '') + (step.index + 1) + ' / ' + (total < 10 ? '0' : '') + total
      storyCaptionRoute.textContent = storyCaptionRouteCopy(step)
      storyCaptionDetail.textContent = storyCaptionDetailCopy(step)
      storyCaptionNext.hidden = !nextStep
      storyCaptionNextLabel.textContent = nextStep
        ? (nextStep.index + 1 < 10 ? '0' : '') + (nextStep.index + 1) + ' \xB7 ' + nextStep.nodeLabel
        : ''
      storyCaption.style.animation = 'none'
      void storyCaption.offsetWidth
      storyCaption.style.removeProperty('animation')
    }
    function storyMomentLink() {
      const view = activeIndex >= 0 ? views[activeIndex] : null
      const step = storyBeatIndex >= 0 ? storySteps[storyBeatIndex] : null
      if (!view || !step) return ''
      const url = new URL(location.href)
      url.searchParams.delete('play')
      url.hash = 'view=' + encodeURIComponent(view.id) + '&beat=' + encodeURIComponent(step.nodeId)
      return url.href
    }
    function fallbackCopyStoryMoment(value) {
      const field = document.createElement('textarea')
      field.value = value
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch (_) {
        reportArchifyFailure(_)
      }
      field.remove()
      return copied
    }
    function resetBeatLinkFeedback() {
      if (beatLinkFeedbackTimer) clearTimeout(beatLinkFeedbackTimer)
      beatLinkFeedbackTimer = null
      beatLink.removeAttribute('data-copy-state')
      beatLinkLabel.textContent = viewerText('viewer.guided.copyMoment')
    }
    function syncBeatLink() {
      const step = storyBeatIndex >= 0 ? storySteps[storyBeatIndex] : null
      const available = !!(activeIndex >= 0 && step && !currentHandoff)
      beatLink.disabled = !available
      if (!beatLink.hasAttribute('data-copy-state')) beatLinkLabel.textContent = viewerText('viewer.guided.copyMoment')
      const description = available
        ? viewerText('viewer.guided.beatLink', {
            index: step.index + 1,
            label: step.nodeLabel,
            total: storySteps.length,
          })
        : viewerText('viewer.guided.selectBeatLink')
      beatLink.setAttribute('aria-label', description)
      beatLink.title = description
    }
    function setBeatLinkFeedback(copied) {
      resetBeatLinkFeedback()
      beatLink.setAttribute('data-copy-state', copied ? 'copied' : 'failed')
      beatLinkLabel.textContent = viewerText(copied ? 'viewer.guided.copied' : 'viewer.guided.copyFailed')
      beatLink.setAttribute(
        'aria-label',
        viewerText(copied ? 'viewer.guided.momentCopied' : 'viewer.guided.momentCopyFailed'),
      )
      beatLinkFeedbackTimer = setTimeout(function () {
        resetBeatLinkFeedback()
        syncBeatLink()
      }, 1600)
    }
    function copyStoryMomentLink() {
      if (playing) pausePlayback()
      const value = storyMomentLink()
      if (!value) return Promise.resolve(false)
      const copy =
        browserNavigator.clipboard && typeof browserNavigator.clipboard.writeText === 'function'
          ? browserNavigator.clipboard
              .writeText(value)
              .then(function () {
                return true
              })
              .catch(function (error) {
                reportArchifyFailure(error)
                return fallbackCopyStoryMoment(value)
              })
          : Promise.resolve(fallbackCopyStoryMoment(value))
      return copy.then(function (copied) {
        setBeatLinkFeedback(copied)
        return copied
      })
    }
    function hashBeatMatchesCurrent() {
      const view = activeIndex >= 0 ? views[activeIndex] : null
      const step = storyBeatIndex >= 0 ? storySteps[storyBeatIndex] : null
      if (!view || !step) return false
      try {
        const params = new URLSearchParams(location.hash.replace(/^#/, ''))
        return params.get('view') === view.id && params.get('beat') === step.nodeId
      } catch (_) {
        reportArchifyFailure(_)
        return false
      }
    }
    function storyMotionAllowed() {
      if (document.hidden || reducedMotion()) return false
      if (document.documentElement.getAttribute('data-motion') !== 'live') return false
      if (
        document.documentElement.getAttribute('data-embed') === 'true' &&
        document.documentElement.getAttribute('data-share-playback') !== 'true'
      )
        return false
      if (browser.matchMedia && browser.matchMedia('print').matches) return false
      return !(Archify.motionGovernor && Archify.motionGovernor.isPaused())
    }
    function storyAutomaticPlaybackAllowed() {
      if (document.hidden || reducedMotion()) return false
      if (browser.matchMedia && browser.matchMedia('print').matches) return false
      if (Archify.motionGovernor && Archify.motionGovernor.capable) return !Archify.motionGovernor.isPaused()
      return true
    }
    function clearStoryPulse(options) {
      options = options || {}
      storyPulseGeneration += 1
      Array.prototype.forEach.call(svg.querySelectorAll('.story-trail-flow[data-story-pulse]'), function (flow) {
        flow.removeAttribute('data-story-pulse')
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-story-carrier-overlay]'), function (overlay) {
        overlay.remove()
      })
      if (storyPulseOwnerToken && options.release !== false && Archify.motionGovernor) {
        const token = storyPulseOwnerToken
        storyPulseOwnerToken = 0
        Archify.motionGovernor.release(token)
      } else if (options.release === false) storyPulseOwnerToken = 0
    }
    function pulseStoryStep(step) {
      clearStoryPulse()
      if (
        !step ||
        (step.relation !== 'forward' && step.relation !== 'reverse') ||
        step.edges.length !== 1 ||
        !storyMotionAllowed()
      )
        return false
      const flows = Array.prototype.slice.call(
        svg.querySelectorAll('.story-trail-flow[data-story-beat-step="' + step.index + '"]'),
      )
      if (!flows.length) return false
      const pulseGeneration = storyPulseGeneration
      if (Archify.motionGovernor && Archify.motionGovernor.capable) {
        storyPulseOwnerToken = Archify.motionGovernor.claim('story', function () {
          clearStoryPulse({ release: false })
        })
      }
      flows.forEach(function (flow) {
        flow.setAttribute('data-story-pulse', 'true')
      })
      if (Archify.flowTokens && typeof Archify.flowTokens.create === 'function') {
        const edge = step.edges[0]
        const shapes = storyGeometry(edge)
        const carrier = shapes.length
          ? Archify.flowTokens.create(edge, shapes[0], {
              className: 'story-flow-token',
              duration: '0.78s',
            })
          : null
        if (carrier) {
          const carrierOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          const carrierWrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          carrierOverlay.setAttribute('class', 'story-carrier-overlay')
          carrierOverlay.setAttribute('data-story-carrier-overlay', '')
          carrierOverlay.setAttribute('aria-hidden', 'true')
          if (edge.hasAttribute('transform')) carrierWrapper.setAttribute('transform', edge.getAttribute('transform'))
          carrier.setAttribute('data-story-carrier-token', '')
          carrier.setAttribute('data-story-beat-step', String(step.index))
          carrierWrapper.appendChild(carrier)
          carrierOverlay.appendChild(carrierWrapper)
          let firstNode = svg.querySelector('[data-node-id]')
          while (firstNode && firstNode.parentNode !== svg) firstNode = firstNode.parentNode
          if (firstNode) svg.insertBefore(carrierOverlay, firstNode)
          else svg.appendChild(carrierOverlay)
        }
      }
      void flows[0].getBoundingClientRect()
      flows[0].addEventListener(
        'animationend',
        function () {
          if (pulseGeneration === storyPulseGeneration) clearStoryPulse()
        },
        { once: true },
      )
      return true
    }
    function stopStoryBeatTimer(options) {
      options = options || {}
      storyPlaybackGeneration += 1
      if (storyBeatTimer && options.preserveElapsed === true && storyBeatStartedAt) {
        storyBeatElapsedMs = Math.min(
          storyBeatDwellMs,
          storyBeatElapsedMs + Math.max(0, Date.now() - storyBeatStartedAt),
        )
      }
      if (storyBeatTimer) clearTimeout(storyBeatTimer)
      storyBeatTimer = null
      storyBeatStartedAt = 0
    }
    function centerStoryStop(stop) {
      if (!stop || !trail) return false
      const target = Math.max(0, stop.offsetLeft - (trail.clientWidth - stop.offsetWidth) / 2)
      trail.scrollLeft = target
      return true
    }
    function storyBeatDwell(total) {
      return Math.max(STORY_FOLLOW_MIN_DWELL_MS, VIEW_INTERVAL_MS / Math.max(1, total))
    }
    function clearStoryFollow() {
      storyFollowGeneration += 1
      svg.removeAttribute('data-story-follow')
      panel.removeAttribute('data-story-follow')
      panel.removeAttribute('data-story-follow-node')
    }
    function storyFrameIds(step) {
      if (!step) return []
      const ids = []
      if (step.index > 0 && storySteps[step.index - 1]) ids.push(storySteps[step.index - 1].nodeId)
      ids.push(step.nodeId)
      if (step.index + 1 < storySteps.length) ids.push(storySteps[step.index + 1].nodeId)
      return ids
    }
    function followStoryStep(step, options) {
      options = options || {}
      if (!step || document.hidden) return false
      if (!Archify.view || typeof Archify.view.reveal !== 'function') {
        const deferredIndex = step.index
        const deferredGeneration = ++storyFollowGeneration
        requestAnimationFrame(function () {
          if (deferredGeneration !== storyFollowGeneration || storyBeatIndex !== deferredIndex) return
          if (Archify.view && typeof Archify.view.reveal === 'function') followStoryStep(step, options)
        })
        return true
      }
      if (browser.matchMedia && browser.matchMedia('print').matches) return false
      const embed = document.documentElement.getAttribute('data-embed') === 'true'
      const explicitEmbedPlayback = document.documentElement.getAttribute('data-share-playback') === 'true'
      if (embed && !explicitEmbedPlayback && options.linked !== true) return false
      const ids = storyFrameIds(step)
      const generation = ++storyFollowGeneration
      svg.setAttribute('data-story-follow', step.nodeId)
      panel.setAttribute('data-story-follow', 'moving')
      panel.setAttribute('data-story-follow-node', step.nodeId)
      const receipt = Archify.view.reveal(ids, {
        duration: STORY_FOLLOW_DURATION_MS,
        instant:
          options.instant === true ||
          reducedMotion() ||
          document.documentElement.getAttribute('data-motion') !== 'live',
        maxScale: 1.65,
        padding: 64,
        reason: options.manual === true ? 'story-beat' : 'story-follow',
      })
      if (receipt && receipt.finished && typeof receipt.finished.then === 'function') {
        receipt.finished.then(function (result) {
          if (generation !== storyFollowGeneration || storyBeatIndex !== step.index) return
          svg.removeAttribute('data-story-follow')
          panel.setAttribute('data-story-follow', result && result.state === 'complete' ? 'settled' : 'interrupted')
        })
      } else if (generation === storyFollowGeneration) {
        panel.setAttribute('data-story-follow', 'settled')
      }
      return receipt
    }
    function setStoryBeat(index, options) {
      options = options || {}
      const stops = Array.prototype.slice.call(trail.querySelectorAll('[data-story-node]'))
      if (!stops.length) return false
      resetBeatLinkFeedback()
      storyBeatIndex = Math.max(0, Math.min(stops.length - 1, index))
      const nextStep = storyBeatIndex + 1 < storySteps.length ? storySteps[storyBeatIndex + 1] : null
      svg.setAttribute('data-story-beat', storyBeatIndex + 1 + '/' + stops.length)
      panel.setAttribute('data-story-beat', storyBeatIndex + 1 + '/' + stops.length)
      if (nextStep) {
        svg.setAttribute('data-story-next', nextStep.nodeId)
        panel.setAttribute('data-story-next', nextStep.nodeId)
      } else {
        svg.removeAttribute('data-story-next')
        panel.removeAttribute('data-story-next')
      }
      function storyBeatState(step) {
        if (step < storyBeatIndex) return 'past'
        if (step === storyBeatIndex) return 'active'
        if (step === storyBeatIndex + 1) return 'next'
        return 'pending'
      }
      Array.prototype.forEach.call(svg.querySelectorAll('[data-story-step]'), function (node) {
        const step = Number(node.getAttribute('data-story-step'))
        node.setAttribute('data-story-beat-state', storyBeatState(step))
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-story-beat-step]'), function (edge) {
        const step = Number(edge.getAttribute('data-story-beat-step'))
        edge.setAttribute('data-story-beat-state', storyBeatState(step))
      })
      stops.forEach(function (stop, step) {
        stop.setAttribute('data-story-beat-state', storyBeatState(step))
        if (step === storyBeatIndex) stop.setAttribute('aria-current', 'step')
        else stop.removeAttribute('aria-current')
      })
      note.setAttribute('aria-live', 'off')
      note.textContent = storyBeatCopy(storySteps[storyBeatIndex], stops.length)
      renderStoryCaption(storySteps[storyBeatIndex], stops.length, nextStep)
      if (options.center === true) centerStoryStop(stops[storyBeatIndex])
      if (options.pulse === true) pulseStoryStep(storySteps[storyBeatIndex])
      else clearStoryPulse()
      if (options.follow === true)
        followStoryStep(storySteps[storyBeatIndex], {
          instant: options.followInstant === true,
          linked: options.linked === true,
          manual: options.manual === true,
        })
      renderShareCue()
      syncBeatLink()
      return true
    }
    function settleStoryBeats() {
      stopStoryBeatTimer()
      clearStoryPulse()
      clearStoryFollow()
      resetBeatLinkFeedback()
      storyBeatIndex = -1
      storyBeatElapsedMs = 0
      storyBeatDwellMs = 0
      svg.removeAttribute('data-story-beat')
      svg.removeAttribute('data-story-next')
      panel.removeAttribute('data-story-beat')
      panel.removeAttribute('data-story-next')
      Array.prototype.forEach.call(svg.querySelectorAll('[data-story-beat-state]'), function (el) {
        el.removeAttribute('data-story-beat-state')
      })
      Array.prototype.forEach.call(trail.querySelectorAll('[data-story-beat-state]'), function (stop) {
        stop.removeAttribute('data-story-beat-state')
        stop.removeAttribute('aria-current')
      })
      note.setAttribute('aria-live', 'polite')
      if (activeIndex >= 0)
        note.textContent =
          views[activeIndex].note ||
          viewerText('viewer.guided.chapter.selectedNodes', { count: views[activeIndex].focus.length })
      renderStoryCaption(null, 0)
      renderShareCue()
      syncBeatLink()
    }
    function clearStoryTrail() {
      stopStoryBeatTimer()
      clearStoryPulse()
      clearStoryFollow()
      resetBeatLinkFeedback()
      storyBeatIndex = -1
      storyBeatElapsedMs = 0
      storyBeatDwellMs = 0
      storySteps = []
      svg.removeAttribute('data-story-active')
      svg.removeAttribute('data-story-playing')
      svg.removeAttribute('data-story-beat')
      svg.removeAttribute('data-story-next')
      panel.removeAttribute('data-story-beat')
      panel.removeAttribute('data-story-next')
      Array.prototype.forEach.call(svg.querySelectorAll('[data-story-overlay]'), function (overlay) {
        overlay.remove()
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-story-step], [data-story-beat-state]'), function (node) {
        node.removeAttribute('data-story-step')
        node.removeAttribute('data-story-beat-state')
        node.style.removeProperty('--story-step')
      })
      Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-from][data-story-beat-step]'), function (edge) {
        edge.removeAttribute('data-story-beat-step')
        edge.removeAttribute('data-story-beat-state')
      })
      trail.textContent = ''
      trail.hidden = true
      trail.removeAttribute('aria-label')
      renderStoryCaption(null, 0)
      syncBeatLink()
    }
    function storyGeometry(edge) {
      if (/^(path|line|polyline)$/i.test(edge.tagName)) return [edge]
      return Array.prototype.slice.call(edge.querySelectorAll('path, line, polyline'))
    }
    function renderStoryTrail(view) {
      if (Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
        Archify.semanticLens.clearPreview()
      clearStoryTrail()
      if (!view) return
      const nodeList = Array.prototype.slice.call(svg.querySelectorAll('[data-node-id]'))
      const edgeList = Array.prototype.slice.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'))
      const byId = {}
      nodeList.forEach(function (node) {
        byId[node.getAttribute('data-node-id')] = node
      })
      storySteps = view.focus.map(function (_, index) {
        return storyStep(view, index, edgeList, byId)
      })
      const labels = []
      storySteps.forEach(function (step, index) {
        const id = step.nodeId
        const node = byId[id]
        if (!node) return
        node.setAttribute('data-story-step', String(index))
        node.style.setProperty('--story-step', String(index))
        const nodeLabel = step.nodeLabel
        labels.push(nodeLabel)
        const stop = document.createElement('button')
        stop.type = 'button'
        stop.className = 'guided-view-stop'
        stop.setAttribute('data-story-node', id)
        stop.setAttribute('data-story-index', String(index))
        stop.setAttribute('data-story-relation', step.relation)
        stop.setAttribute('data-story-number', (index + 1 < 10 ? '0' : '') + (index + 1))
        if (index > 0) stop.setAttribute('data-story-link', step.relation)
        stop.style.setProperty('--story-step', String(index))
        stop.setAttribute('aria-label', storyBeatAria(step, storySteps.length))
        stop.title = storyBeatCopy(step, storySteps.length)
        stop.textContent = nodeLabel
        trail.appendChild(stop)
      })
      trail.hidden = labels.length === 0
      trail.setAttribute(
        'aria-label',
        viewerText('viewer.guided.storyTrail', { count: labels.length, label: view.label }),
      )
      trail.scrollLeft = 0
      svg.setAttribute('data-story-active', view.id)
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      overlay.setAttribute('class', 'story-trail-overlay')
      overlay.setAttribute('data-story-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      let copied = 0
      storySteps.forEach(function (step) {
        step.edges.forEach(function (edge) {
          const edgeBeat = step.index
          edge.setAttribute('data-story-beat-step', String(edgeBeat))
          const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g')
          if (edge.hasAttribute('transform')) wrapper.setAttribute('transform', edge.getAttribute('transform'))
          storyGeometry(edge).forEach(function (shape) {
            const clone = shape.cloneNode(false)
            clone.removeAttribute('id')
            clone.removeAttribute('marker-start')
            clone.removeAttribute('marker-mid')
            clone.removeAttribute('marker-end')
            clone.removeAttribute('aria-label')
            clone.removeAttribute('role')
            clone.removeAttribute('data-animate')
            clone.removeAttribute('data-edge-from')
            clone.removeAttribute('data-edge-to')
            clone.removeAttribute('data-edge-key')
            clone.removeAttribute('data-edge-id')
            clone.removeAttribute('data-edge-label')
            clone.setAttribute('class', 'story-trail-flow')
            clone.setAttribute('data-story-beat-step', String(edgeBeat))
            clone.style.setProperty('--story-step', String(edgeBeat))
            wrapper.appendChild(clone)
            copied += 1
          })
          if (wrapper.childNodes.length) overlay.appendChild(wrapper)
        })
      })
      if (copied) {
        const firstEdge = edgeList[0]
        if (firstEdge && firstEdge.parentNode) firstEdge.parentNode.insertBefore(overlay, firstEdge)
        else svg.insertBefore(overlay, svg.firstChild)
      }
    }
    function syncStoryPlayback() {
      const shouldPlay = playing && activeIndex >= 0
      if (shouldPlay && svg.getAttribute('data-story-playing') !== 'true')
        svg.setAttribute('data-story-playing', 'true')
      else if (!shouldPlay && svg.hasAttribute('data-story-playing')) svg.removeAttribute('data-story-playing')
    }
    function resetProgress(fraction) {
      fraction = Math.max(0, Math.min(1, Number(fraction) || 0))
      progressBar.style.animation = 'none'
      progressBar.style.setProperty('--guided-progress-start', String(fraction))
      progressBar.style.transform = 'scaleX(' + fraction + ')'
    }
    function startProgress(fraction, duration) {
      resetProgress(fraction)
      void progressBar.offsetWidth
      progressBar.style.animation =
        'archify-guided-progress ' + Math.max(1, duration || VIEW_INTERVAL_MS) + 'ms linear forwards'
    }
    function currentStoryProgress() {
      const total = storySteps.length
      if (!total || storyBeatIndex < 0) return 0
      let elapsed = storyBeatElapsedMs
      if (playing && storyBeatTimer && storyBeatStartedAt) elapsed += Math.max(0, Date.now() - storyBeatStartedAt)
      const dwell = storyBeatDwellMs || storyBeatDwell(total)
      return Math.max(0, Math.min(1, (storyBeatIndex + Math.min(1, elapsed / dwell)) / total))
    }
    function renderPlayback() {
      const automaticPlaybackAllowed = storyAutomaticPlaybackAllowed()
      panel.setAttribute('data-playing', playing ? 'true' : 'false')
      syncStoryPlayback()
      play.disabled = !playing && !automaticPlaybackAllowed
      play.setAttribute('aria-pressed', playing ? 'true' : 'false')
      play.setAttribute(
        'aria-label',
        viewerText(
          playing
            ? 'viewer.guided.pause'
            : !automaticPlaybackAllowed
              ? 'viewer.guided.motionUnavailable'
              : storyPlaybackComplete
                ? 'viewer.guided.replay'
                : 'viewer.guided.play',
        ),
      )
      play.title = viewerText(
        playing
          ? 'viewer.guided.pause.title'
          : !automaticPlaybackAllowed
            ? 'viewer.guided.enableMotion'
            : storyPlaybackComplete
              ? 'viewer.guided.replay.title'
              : 'viewer.guided.play.title',
      )
      playIcon.textContent = playing ? '\u2016' : '\u25B6'
      playLabel.textContent = viewerText(
        playing
          ? 'viewer.guided.pauseStory'
          : storyPlaybackComplete
            ? 'viewer.guided.replayStory'
            : 'viewer.guided.playStory',
      )
      if (storyCaption && !storyCaption.hidden) storyCaption.setAttribute('aria-live', playing ? 'off' : 'polite')
    }
    function render() {
      const view = views[activeIndex]
      count.textContent = activeIndex < 0 ? '0 / ' + views.length : activeIndex + 1 + ' / ' + views.length
      label.textContent = view ? view.label : viewerText('viewer.guided.explore')
      note.setAttribute('aria-live', storyBeatIndex >= 0 ? 'off' : 'polite')
      note.textContent =
        storyBeatIndex >= 0
          ? storyBeatCopy(storySteps[storyBeatIndex], storySteps.length)
          : view
            ? view.note || viewerText('viewer.guided.chapter.selectedNodes', { count: view.focus.length })
            : viewerText('viewer.guided.intro')
      prev.disabled = activeIndex < 0
      next.disabled = activeIndex >= views.length - 1
      all.disabled = activeIndex < 0
      panel.setAttribute('data-active-view', view ? view.id : 'all')
      syncChapterIndex()
      renderShareCue()
      renderPlayback()
      syncBeatLink()
    }
    function pausePlayback(options) {
      options = options || {}
      const progress = options.complete === true ? 1 : currentStoryProgress()
      if (panel.getAttribute('data-autoplay') === 'playing') {
        setShareCueProgress(progress)
        setAutoplayState(options.complete === true ? 'complete' : 'interrupted')
      }
      stopStoryBeatTimer({ preserveElapsed: options.complete !== true })
      clearStoryPulse()
      clearStoryFollow()
      playing = false
      storyPlaybackComplete = options.complete === true
      resetProgress(progress)
      renderPlayback()
      renderShareCue()
    }
    function finishStoryChapter() {
      if (!playing) return false
      if (storyPlaybackScope === 'chapter') {
        pausePlayback({ complete: true })
        return true
      }
      if (activeIndex < views.length - 1) {
        const destinationIndex = activeIndex + 1
        activate(destinationIndex, { playback: true })
        afterHandoff(function () {
          if (!playing || activeIndex !== destinationIndex) return
          storyBeatElapsedMs = 0
          setStoryBeat(0, { follow: true, pulse: true })
          scheduleStoryPlayback()
        })
        return true
      }
      pausePlayback({ complete: true })
      return true
    }
    function scheduleStoryPlayback() {
      const total = storySteps.length
      if (!playing || !total || reducedMotion()) {
        if (playing) pausePlayback()
        return false
      }
      storyBeatDwellMs = storyBeatDwell(total)
      if (storyBeatIndex < 0) {
        storyBeatElapsedMs = 0
        setStoryBeat(0, { follow: true, pulse: true })
      }
      storyBeatElapsedMs = Math.max(0, Math.min(storyBeatDwellMs, storyBeatElapsedMs))
      const remainingDwell = Math.max(1, storyBeatDwellMs - storyBeatElapsedMs)
      const progress = (storyBeatIndex + storyBeatElapsedMs / storyBeatDwellMs) / total
      const remainingChapter = remainingDwell + Math.max(0, total - storyBeatIndex - 1) * storyBeatDwellMs
      startProgress(progress, remainingChapter)
      if (panel.getAttribute('data-autoplay') === 'playing') startShareCueProgress(progress, remainingChapter)
      const generation = ++storyPlaybackGeneration
      storyBeatStartedAt = Date.now()
      storyBeatTimer = setTimeout(function () {
        if (!playing || generation !== storyPlaybackGeneration) return
        storyBeatTimer = null
        storyBeatStartedAt = 0
        storyBeatElapsedMs = 0
        if (storyBeatIndex < total - 1) {
          setStoryBeat(storyBeatIndex + 1, { follow: true, pulse: true })
          scheduleStoryPlayback()
        } else finishStoryChapter()
      }, remainingDwell)
      return true
    }
    function startPlayback() {
      if (!storyAutomaticPlaybackAllowed()) {
        renderPlayback()
        return false
      }
      autoplayPending = false
      setAutoplayState(null)
      setShareCueProgress(0)
      document.documentElement.removeAttribute('data-share-playback')
      storyPlaybackScope = 'story'
      if (storyPlaybackComplete) showAll({ updateUrl: false })
      storyPlaybackComplete = false
      if (activeIndex < 0) activate(0, { playback: true })
      playing = true
      renderPlayback()
      afterHandoff(function () {
        if (!playing) return
        if (storyBeatIndex >= 0) followStoryStep(storySteps[storyBeatIndex])
        scheduleStoryPlayback()
      })
      return true
    }
    function startCurrentViewPlayback() {
      if (document.hidden) return false
      autoplayPending = false
      document.documentElement.setAttribute('data-share-playback', 'true')
      storyPlaybackScope = 'chapter'
      storyPlaybackComplete = false
      if (activeIndex < 0) activate(0, { playback: true, updateUrl: false })
      if (!storyAutomaticPlaybackAllowed()) {
        const preserveMoment = hashBeatMatchesCurrent()
        setShareCueProgress(preserveMoment && storySteps.length ? (storyBeatIndex + 1) / storySteps.length : 1)
        setAutoplayState('reduced-motion')
        playing = false
        if (preserveMoment) {
          clearStoryPulse()
          renderShareCue()
        } else settleStoryBeats()
        renderPlayback()
        return false
      }
      playing = true
      setAutoplayState('playing')
      renderPlayback()
      afterHandoff(function () {
        if (!playing) return
        if (storyBeatIndex >= 0) followStoryStep(storySteps[storyBeatIndex])
        scheduleStoryPlayback()
      })
      return true
    }
    function maybeStartSharePlayback() {
      if (!autoplayPending || document.hidden) return false
      return startCurrentViewPlayback()
    }
    function togglePlayback() {
      return playing ? (pausePlayback(), false) : startPlayback()
    }
    function syncStoryControlsDisabled() {
      Array.prototype.forEach.call(trail.querySelectorAll('[data-story-node]'), function (stop) {
        stop.disabled = !!currentHandoff
      })
      syncBeatLink()
    }
    function selectStoryBeat(index) {
      if (currentHandoff || activeIndex < 0 || index < 0 || index >= storySteps.length) return false
      momentRestoreGeneration += 1
      clearChapterPreview({ clearIntents: true })
      if (playing) pausePlayback()
      else {
        stopStoryBeatTimer()
        clearStoryPulse()
      }
      storyPlaybackComplete = false
      storyPlaybackScope = 'story'
      storyBeatElapsedMs = 0
      storyBeatDwellMs = storyBeatDwell(storySteps.length)
      const view = views[activeIndex]
      Archify.focus.setMany(view.focus, {
        hideChip: true,
        label: view.label,
        mode: 'selection',
        toggle: false,
        updateUrl: false,
      })
      setStoryBeat(index, { center: true, follow: true, manual: true, pulse: true })
      resetProgress(index / storySteps.length)
      renderPlayback()
      return true
    }
    function selectStoryBeatById(id, options) {
      options = options || {}
      const index = storySteps.findIndex(function (step) {
        return step.nodeId === id
      })
      if (index < 0) return false
      if (playing) pausePlayback()
      else {
        stopStoryBeatTimer()
        clearStoryPulse()
      }
      storyPlaybackComplete = false
      storyPlaybackScope = 'story'
      storyBeatElapsedMs = 0
      storyBeatDwellMs = storyBeatDwell(storySteps.length)
      setStoryBeat(index, {
        center: true,
        follow: options.follow === true,
        followInstant: options.followInstant === true,
        linked: options.linked === true,
        manual: false,
        pulse: false,
      })
      resetProgress(index / storySteps.length)
      renderPlayback()
      return true
    }
    function updateUrl(view) {
      try {
        history.replaceState(
          null,
          '',
          location.pathname + location.search + (view ? '#view=' + encodeURIComponent(view.id) : ''),
        )
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function showAll(options) {
      options = options || {}
      if (options.restore !== true) momentRestoreGeneration += 1
      clearChapterPreview({ clearIntents: true })
      if (playing && options.playback !== true) pausePlayback()
      if (options.playback !== true) storyPlaybackComplete = false
      cancelHandoff('overview')
      activeIndex = -1
      renderStoryTrail(null)
      if (options.clearFocus !== false) Archify.focus.clear({ updateUrl: false })
      if (options.resetView !== false && Archify.view && typeof Archify.view.reset === 'function') {
        Archify.view.reset({ automatic: true })
      }
      render()
      if (options.updateUrl !== false) updateUrl(null)
    }
    function activate(index, options) {
      options = options || {}
      if (options.restore !== true) momentRestoreGeneration += 1
      if (playing && options.playback !== true) pausePlayback()
      if (options.playback !== true) storyPlaybackComplete = false
      if (index < 0) {
        showAll(options)
        return true
      }
      if (index >= views.length) return false
      clearChapterPreview({ clearIntents: true })
      const previousIndex = activeIndex
      const previous = previousIndex >= 0 ? views[previousIndex] : null
      const outgoingBeatIndex = storyBeatIndex
      cancelHandoff('replaced')
      activeIndex = index
      const view = views[index]
      Archify.focus.setMany(view.focus, {
        hideChip: true,
        label: view.label,
        mode: 'selection',
        toggle: false,
        updateUrl: false,
      })
      renderStoryTrail(view)
      beginHandoff(
        previousIndex,
        index,
        previous,
        view,
        outgoingBeatIndex,
        options.playback === true ? 'playback' : 'guided',
      )
      syncStoryControlsDisabled()
      render()
      if (options.updateUrl !== false) updateUrl(view)
      return true
    }
    function activateById(id, options) {
      const index = views.findIndex(function (view) {
        return view.id === id
      })
      return index >= 0 && activate(index, options)
    }
    prev.addEventListener('click', function () {
      activate(activeIndex - 1)
    })
    next.addEventListener('click', function () {
      activate(activeIndex + 1)
    })
    all.addEventListener('click', function () {
      showAll()
    })
    play.addEventListener('click', togglePlayback)
    beatLink.addEventListener('click', copyStoryMomentLink)
    trail.addEventListener('focusin', function (event) {
      if (!event.target.closest('[data-story-node]')) return
      if (playing) pausePlayback()
    })
    trail.addEventListener('click', function (event) {
      const stop = event.target.closest('[data-story-node]')
      if (!stop || stop.disabled) return
      selectStoryBeat(Number(stop.getAttribute('data-story-index')))
    })
    trail.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const stop = event.target.closest('[data-story-node]')
      if (!stop || stop.disabled) return
      event.preventDefault()
      selectStoryBeat(Number(stop.getAttribute('data-story-index')))
    })
    chapterList.addEventListener('click', function (event) {
      const button = event.target.closest('[data-guided-view-id]')
      if (!button) return
      activateById(button.getAttribute('data-guided-view-id'))
    })
    chapterList.addEventListener('pointerover', function (event) {
      const button = event.target.closest('[data-guided-view-id]')
      if (!button || !hoverCapable() || event.pointerType === 'touch') return
      if (event.relatedTarget && button.contains(event.relatedTarget)) return
      setChapterPreviewIntent('pointer', chapterButtons.indexOf(button))
    })
    chapterList.addEventListener('pointerout', function (event) {
      const button = event.target.closest('[data-guided-view-id]')
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return
      clearChapterPreviewIntent('pointer', chapterButtons.indexOf(button))
    })
    chapterIndex.addEventListener('focusin', function (event) {
      const button = event.target.closest('[data-guided-view-id]')
      if (!button) return
      setChapterPreviewIntent('focus', chapterButtons.indexOf(button))
    })
    chapterIndex.addEventListener('focusout', function (event) {
      const button = event.target.closest('[data-guided-view-id]')
      if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) return
      clearChapterPreviewIntent('focus', chapterButtons.indexOf(button))
    })
    chapterList.addEventListener('keydown', function (event) {
      const button = event.target.closest('[data-guided-view-id]')
      const index = chapterButtons.indexOf(button)
      if (index < 0) return
      let target = null
      if (event.key === 'ArrowRight') target = Math.min(chapterButtons.length - 1, index + 1)
      else if (event.key === 'ArrowLeft') target = Math.max(0, index - 1)
      else if (event.key === 'Home') target = 0
      else if (event.key === 'End') target = chapterButtons.length - 1
      if (target === null) return
      event.preventDefault()
      focusChapterButton(target)
    })
    function releaseForNode(event) {
      if (activeIndex >= 0 && event.target.closest('[data-node-id]')) {
        pausePlayback()
        showAll({ clearFocus: false, updateUrl: false })
      }
    }
    svg.addEventListener('click', releaseForNode, true)
    svg.addEventListener(
      'keydown',
      function (event) {
        if (event.key === 'Enter' || event.key === ' ') releaseForNode(event)
      },
      true,
    )
    document.addEventListener(
      'keydown',
      function (event) {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        if (document.documentElement.getAttribute('data-guide-open') === 'true') return
        const target = event.target
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
        if (event.key === ']') {
          event.preventDefault()
          if (activeIndex < views.length - 1) activate(activeIndex + 1)
        } else if (event.key === '[') {
          event.preventDefault()
          if (activeIndex >= 0) activate(activeIndex - 1)
        } else if (event.key.toLowerCase() === 'p') {
          event.preventDefault()
          togglePlayback()
        } else if (event.key === 'Escape' && activePreviewIndex >= 0) {
          event.preventDefault()
          event.stopImmediatePropagation()
          clearChapterPreview({ clearIntents: true })
        } else if (event.key === 'Escape' && activeIndex >= 0) {
          event.preventDefault()
          showAll()
        }
      },
      true,
    )
    function syncViewFromHash() {
      try {
        const params = new URLSearchParams(location.hash.replace(/^#/, ''))
        const initial = params.get('view')
        const requestedBeat = params.get('beat')
        const restoreGeneration = ++momentRestoreGeneration
        if (initial) {
          const activated = activateById(initial, { restore: true, updateUrl: false })
          if (!activated) {
            showAll({ restore: true, updateUrl: false })
            return
          }
          if (requestedBeat)
            afterHandoff(function () {
              if (restoreGeneration !== momentRestoreGeneration) return
              const latest = new URLSearchParams(location.hash.replace(/^#/, ''))
              if (latest.get('view') !== initial || latest.get('beat') !== requestedBeat) return
              if (activeIndex < 0 || views[activeIndex].id !== initial) return
              selectStoryBeatById(requestedBeat, { follow: true, followInstant: true, linked: true })
            })
        } else if (params.get('focus') || params.get('relation')) {
          activeIndex = -1
          render()
        } else {
          showAll({ restore: true, updateUrl: false })
        }
      } catch (_) {
        reportArchifyFailure(_)
        showAll({ restore: true, updateUrl: false })
      }
    }
    browser.addEventListener('hashchange', syncViewFromHash)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearChapterPreview({ clearIntents: true })
        if (playing) pausePlayback()
        else clearStoryPulse()
        settleHandoff('hidden')
      } else if (!document.hidden) maybeStartSharePlayback()
    })
    if (browser.matchMedia) {
      const guidedMotionQuery = browser.matchMedia('(prefers-reduced-motion: reduce)')
      const onGuidedMotionChange = function () {
        if (guidedMotionQuery.matches) {
          if (playing) pausePlayback()
          else clearStoryPulse()
          settleHandoff('reduced-motion')
        }
      }
      if (typeof guidedMotionQuery.addEventListener === 'function')
        guidedMotionQuery.addEventListener('change', onGuidedMotionChange)
      else if (typeof guidedMotionQuery.addListener === 'function') guidedMotionQuery.addListener(onGuidedMotionChange)
    }
    if (
      document.documentElement.getAttribute('data-embed') !== 'true' &&
      typeof MutationObserver !== 'undefined' &&
      typeof Node !== 'undefined' &&
      svg instanceof Node &&
      document.documentElement instanceof Node
    ) {
      const chapterPreviewOwnerObserver = new MutationObserver(syncChapterPreview)
      chapterPreviewOwnerObserver.observe(svg, {
        attributeFilter: [
          'data-route-picking',
          'data-route-active',
          'data-lens-active',
          'data-legend-preview-active',
          'data-relationship-preview-active',
          'data-intent-trace-active',
          'data-focus-active',
        ],
        attributes: true,
      })
      const storyMotionObserver = new MutationObserver(function () {
        if (document.documentElement.getAttribute('data-motion') !== 'live') clearStoryPulse()
        renderPlayback()
      })
      storyMotionObserver.observe(document.documentElement, { attributeFilter: ['data-motion'], attributes: true })
    }
    browser.addEventListener('beforeprint', function () {
      clearChapterPreview({ clearIntents: true })
      if (playing) pausePlayback()
      else clearStoryPulse()
      settleHandoff('print')
    })
    syncViewFromHash()
    if (autoplayPending) {
      requestAnimationFrame(function () {
        requestAnimationFrame(maybeStartSharePlayback)
      })
    }
    return {
      activate: activateById,
      active: function () {
        return activeIndex < 0 ? null : views[activeIndex].id
      },
      beat: function () {
        const step = storyBeatIndex >= 0 ? storySteps[storyBeatIndex] : null
        return step
          ? {
              edgeKeys: step.edgeKeys.slice(),
              index: step.index,
              nodeId: step.nodeId,
              position: step.index + 1,
              relation: step.relation,
              total: storySteps.length,
            }
          : null
      },
      beatLink: storyMomentLink,
      cancelHandoff,
      clearPreview: function () {
        return clearChapterPreview({ clearIntents: true })
      },
      copyBeatLink: copyStoryMomentLink,
      count: views.length,
      delta: function (id) {
        const index = views.findIndex(function (view) {
          return view.id === id
        })
        if (index < 0) return null
        const value = chapterDelta(activeIndex >= 0 ? views[activeIndex] : null, views[index])
        return { enter: value.enter.slice(), leave: value.leave.slice(), stay: value.stay.slice() }
      },
      focus: function () {
        return activeIndex < 0 ? [] : views[activeIndex].focus.slice()
      },
      handoff: function () {
        return currentHandoff
          ? { anchor: currentHandoff.anchor || null, id: currentHandoff.id, mode: currentHandoff.mode }
          : null
      },
      isPlaying: function () {
        return playing
      },
      pause: pausePlayback,
      play: startPlayback,
      playCurrent: startCurrentViewPlayback,
      preview: function () {
        return activePreviewIndex < 0 ? null : views[activePreviewIndex].id
      },
      settleHandoff,
      showAll,
    }
  })()
  Archify.waitForStableLayout = function (options) {
    options = options || {}
    const maximumFrames = Math.max(1, Number(options.maximumFrames) || 240)
    const fontsReady =
      document.fonts && document.fonts.ready
        ? document.fonts.ready.catch(function (error) {
            reportArchifyFailure(error)
          })
        : Promise.resolve()
    return fontsReady.then(function () {
      if (typeof options.schedule === 'function') options.schedule()
      return new Promise(function (resolve, reject) {
        let previous = ''
        let stableFrames = 0
        let sampledFrames = 0
        function sample() {
          sampledFrames += 1
          if (typeof options.pending === 'function' && options.pending()) {
            previous = ''
            stableFrames = 0
          } else {
            const current = typeof options.snapshot === 'function' ? options.snapshot() : ''
            if (current === previous) stableFrames += 1
            else {
              previous = current
              stableFrames = 0
            }
            if (stableFrames >= 3) {
              resolve({ sampledFrames, snapshot: current, stable: true })
              return
            }
          }
          if (sampledFrames >= maximumFrames) {
            reject(new Error(options.timeoutMessage || 'Layout did not reach stable dimensions.'))
            return
          }
          requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })
    })
  }
  const DIAGRAM_SHAPE = {
    container: '.diagram-container',
    enabled: 'true',
    minimumWideRatio: 1.55,
    shapeAttribute: 'data-diagram-shape',
    svg: ':scope > svg',
    wide: 'wide',
    wideAttribute: 'data-wide-diagram',
  }
  const markDiagramShape = () => {
    const container = document.querySelector(DIAGRAM_SHAPE.container)
    const svg = container?.querySelector(DIAGRAM_SHAPE.svg)
    const viewBox = svg?.viewBox?.baseVal
    if (!viewBox?.height || viewBox.width / viewBox.height < DIAGRAM_SHAPE.minimumWideRatio) return
    container.setAttribute(DIAGRAM_SHAPE.wideAttribute, DIAGRAM_SHAPE.enabled)
    document.documentElement.setAttribute(DIAGRAM_SHAPE.shapeAttribute, DIAGRAM_SHAPE.wide)
  }
  markDiagramShape()
  Archify.viewerChromeLayout = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container && container.querySelector(':scope > svg')
    const nav = container && container.querySelector('.diagram-nav')
    const legend = svg && svg.querySelector('[data-legend]')
    let frame = 0
    let settleFrame = 0
    let reserve = 0
    let railLatched = false
    let probingBaseline = false
    let probePromise = null
    let baselineIntersectionArea = 0
    let baselineStageGap = null
    let restorableReserve = 0
    let probeFallbackReserve = 0
    let lastReceipt = null
    const SAFE_GAP = 10
    function visible(element) {
      if (!element || element.hidden) return false
      const style = browser.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }
    function usable(rect) {
      return Boolean(rect && rect.width > 0 && rect.height > 0)
    }
    function intersectionArea(a, b) {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      return width * height
    }
    function protectedStageRect() {
      if (!svg) return null
      const rect = svg.getBoundingClientRect()
      let transform = ''
      try {
        transform = browser.getComputedStyle(svg).transform || ''
      } catch (_) {
        reportArchifyFailure(_)
      }
      let scaleX = 1
      let scaleY = 1
      let translateX = 0
      let translateY = 0
      const matrix = transform.match(/^matrix\(([^)]+)\)$/)
      const matrix3d = transform.match(/^matrix3d\(([^)]+)\)$/)
      if (matrix) {
        const values = matrix[1].split(',').map(Number)
        if (values.length === 6 && values.every(Number.isFinite)) {
          scaleX = Math.abs(values[0]) || 1
          scaleY = Math.abs(values[3]) || 1
          translateX = values[4]
          translateY = values[5]
        }
      } else if (matrix3d) {
        const values3d = matrix3d[1].split(',').map(Number)
        if (values3d.length === 16 && values3d.every(Number.isFinite)) {
          scaleX = Math.abs(values3d[0]) || 1
          scaleY = Math.abs(values3d[5]) || 1
          translateX = values3d[12]
          translateY = values3d[13]
        }
      }
      const width = rect.width / scaleX
      const height = rect.height / scaleY
      const left = rect.left - translateX
      const top = rect.top - translateY
      return {
        bottom: top + height,
        height,
        left,
        right: left + width,
        top,
        width,
        x: left,
        y: top,
      }
    }
    function eligible() {
      return Boolean(
        container &&
        svg &&
        nav &&
        browser.innerWidth > 720 &&
        html.getAttribute('data-embed') !== 'true' &&
        (!browser.matchMedia || !browser.matchMedia('print').matches) &&
        visible(nav),
      )
    }
    function cameraAtBaseline() {
      const scale = Number(svg && svg.getAttribute('data-view-scale'))
      return !Number.isFinite(scale) || Math.abs(scale - 1) < 1e-3
    }
    function writeReserve(next, options) {
      options = options || {}
      next = Math.max(0, Math.ceil(next))
      if (Math.abs(next - reserve) < 1) return false
      reserve = next
      if (reserve) {
        if (options.remember !== false) restorableReserve = reserve
        container.style.setProperty('--archify-nav-reserve', reserve + 'px')
        container.setAttribute('data-nav-stage-rail', 'true')
        html.setAttribute('data-nav-stage-rail', 'true')
      } else {
        container.style.removeProperty('--archify-nav-reserve')
        container.removeAttribute('data-nav-stage-rail')
        html.removeAttribute('data-nav-stage-rail')
      }
      if (options.quiet !== true) {
        if (settleFrame) cancelAnimationFrame(settleFrame)
        settleFrame = requestAnimationFrame(function () {
          settleFrame = 0
          schedule()
        })
      }
      return true
    }
    function clear(options) {
      options = options || {}
      railLatched = false
      if (options.preserveBaseline !== true) {
        baselineIntersectionArea = 0
        baselineStageGap = null
        restorableReserve = 0
      }
      writeReserve(0, { quiet: probingBaseline })
      lastReceipt = {
        active: false,
        baselineIntersectionArea: 0,
        baselineStageGap: null,
        eligible: false,
        gap: SAFE_GAP,
        intersectionArea: 0,
        reserve: 0,
        stageGap: null,
        stageIntersectionArea: 0,
      }
      return lastReceipt
    }
    function measure() {
      frame = 0
      if (probingBaseline) return null
      if (!eligible()) return clear({ preserveBaseline: !cameraAtBaseline() })
      if (!cameraAtBaseline()) {
        if (reserve === 0 && restorableReserve > 0) {
          if (writeReserve(restorableReserve)) return null
        }
        const cameraNavRect = nav.getBoundingClientRect()
        const cameraLegendRect = visible(legend) ? legend.getBoundingClientRect() : null
        const cameraStageRect = protectedStageRect()
        const cameraIntersectionArea =
          usable(cameraLegendRect) && intersectionArea(cameraNavRect, cameraStageRect) > 0
            ? intersectionArea(cameraNavRect, cameraLegendRect)
            : 0
        lastReceipt = {
          active: reserve > 0,
          baselineIntersectionArea: Math.round(baselineIntersectionArea * 100) / 100,
          baselineStageGap: isMissing(baselineStageGap) ? null : Math.round(baselineStageGap * 100) / 100,
          eligible: true,
          gap: SAFE_GAP,
          intersectionArea: Math.round(cameraIntersectionArea * 100) / 100,
          reserve,
          stageGap: Math.round((cameraNavRect.top - cameraStageRect.bottom) * 100) / 100,
          stageIntersectionArea: Math.round(intersectionArea(cameraNavRect, cameraStageRect) * 100) / 100,
        }
        return lastReceipt
      }
      let navRect = nav.getBoundingClientRect()
      let legendRect = visible(legend) ? legend.getBoundingClientRect() : null
      let stageRect = protectedStageRect()
      if (!usable(navRect) || !usable(stageRect)) return clear()
      const actualIntersectionArea = usable(legendRect) ? intersectionArea(navRect, legendRect) : 0
      let stageGap = navRect.top - stageRect.bottom
      if (!railLatched && reserve === 0) {
        baselineIntersectionArea = actualIntersectionArea
        baselineStageGap = stageGap
        if (stageGap < SAFE_GAP) {
          railLatched = true
          if (writeReserve(Math.max(0, SAFE_GAP - stageGap))) return null
        }
      } else if (railLatched && reserve > 0 && stageGap < SAFE_GAP) {
        const remaining = Math.max(1, SAFE_GAP - stageGap)
        if (writeReserve(reserve + remaining)) return null
      }
      navRect = nav.getBoundingClientRect()
      legendRect = visible(legend) ? legend.getBoundingClientRect() : null
      stageRect = protectedStageRect()
      stageGap = navRect.top - stageRect.bottom
      lastReceipt = {
        active: reserve > 0,
        baselineIntersectionArea: Math.round(baselineIntersectionArea * 100) / 100,
        baselineStageGap: isMissing(baselineStageGap) ? null : Math.round(baselineStageGap * 100) / 100,
        eligible: true,
        gap: SAFE_GAP,
        intersectionArea: Math.round((usable(legendRect) ? intersectionArea(navRect, legendRect) : 0) * 100) / 100,
        reserve,
        stageGap: Math.round(stageGap * 100) / 100,
        stageIntersectionArea: Math.round(intersectionArea(navRect, stageRect) * 100) / 100,
      }
      return lastReceipt
    }
    function reprobe() {
      if (probingBaseline) return probePromise || Promise.resolve(false)
      if (!cameraAtBaseline()) {
        schedule()
        return Promise.resolve(false)
      }
      if (!reserve && !railLatched && !restorableReserve) {
        schedule()
        return Promise.resolve(false)
      }
      probeFallbackReserve = restorableReserve || reserve
      probingBaseline = true
      railLatched = false
      baselineIntersectionArea = 0
      baselineStageGap = null
      restorableReserve = 0
      writeReserve(0, { quiet: true })
      probePromise = Promise.resolve().then(function () {
        probingBaseline = false
        probePromise = null
        if (!cameraAtBaseline() && probeFallbackReserve > 0) {
          restorableReserve = probeFallbackReserve
        }
        probeFallbackReserve = 0
        schedule()
        return true
      })
      return probePromise
    }
    function schedule() {
      if (frame) return
      frame = requestAnimationFrame(measure)
    }
    function stableSnapshot() {
      const containerRect = container ? container.getBoundingClientRect() : { height: 0, width: 0 }
      const navRect = nav ? nav.getBoundingClientRect() : { left: 0, top: 0 }
      const legendRect = legend ? legend.getBoundingClientRect() : { left: 0, top: 0 }
      return [
        reserve,
        Math.round(containerRect.width * 100) / 100,
        Math.round(containerRect.height * 100) / 100,
        Math.round(navRect.left * 100) / 100,
        Math.round(navRect.top * 100) / 100,
        Math.round(legendRect.left * 100) / 100,
        Math.round(legendRect.top * 100) / 100,
        railLatched ? 'latched' : 'clear',
        lastReceipt ? lastReceipt.stageGap : '',
      ].join('|')
    }
    function whenStable() {
      return Archify.waitForStableLayout({
        pending: function () {
          return Boolean(frame || settleFrame || probingBaseline)
        },
        schedule,
        snapshot: stableSnapshot,
        timeoutMessage: 'Viewer chrome layout did not reach stable dimensions.',
      })
    }
    browser.addEventListener('resize', reprobe, { passive: true })
    browser.addEventListener('load', schedule, { once: true })
    browser.addEventListener('beforeprint', schedule)
    browser.addEventListener('afterprint', reprobe)
    if (document.fonts && document.fonts.ready)
      document.fonts.ready.then(reprobe).catch(function (error) {
        reportArchifyFailure(error)
      })
    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(schedule)
      ;[nav, svg, legend].forEach(function (element) {
        if (element) resizeObserver.observe(element)
      })
    }
    if (typeof MutationObserver === 'function') {
      const contentObserver = new MutationObserver(function (records) {
        const viewerModeChanged = records.some(function (record) {
          return record.target === html
        })
        if (viewerModeChanged) reprobe()
        else schedule()
      })
      if (legend) contentObserver.observe(legend, { attributes: true, childList: true, subtree: true })
      contentObserver.observe(html, {
        attributeFilter: ['data-embed', 'data-present', 'data-preset', 'data-theme'],
        attributes: true,
      })
    }
    schedule()
    return {
      active: function () {
        return reserve > 0
      },
      measure,
      receipt: function () {
        return lastReceipt || measure()
      },
      reprobe,
      schedule,
      stageRect: protectedStageRect,
      whenStable,
    }
  })()
  Archify.view = (function () {
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector('svg')
    const outBtn = container.querySelector('[data-view="out"]')
    const resetBtn = container.querySelector('[data-view="reset"]')
    const resetDetailLabel = resetBtn.querySelector('[data-view-detail]')
    const resetPercentLabel = resetBtn.querySelector('[data-view-percent]')
    const inBtn = container.querySelector('[data-view="in"]')
    let state = { mode: 'overview', scale: 1, x: 0, y: 0 }
    let drag = null
    let cameraTimer = null
    let cameraFrame = null
    let cameraGeneration = 0
    let cameraTransaction = null
    let clipFrame = 0
    let resizeFrame = 0
    let autoScrollUntil = 0
    const viewBox = svg.viewBox && svg.viewBox.baseVal
    function clamp() {
      const width = svg.clientWidth || 1
      const height = svg.clientHeight || 1
      state.x = Math.min(0, Math.max(width - width * state.scale, state.x))
      state.y = Math.min(0, Math.max(height - height * state.scale, state.y))
    }
    function reducedMotion() {
      return browser.matchMedia && browser.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
    function contentMetrics() {
      if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) return null
      const width = svg.clientWidth || 1
      const height = svg.clientHeight || 1
      const scale = Math.min(width / viewBox.width, height / viewBox.height)
      return {
        height,
        offsetX: (width - viewBox.width * scale) / 2,
        offsetY: (height - viewBox.height * scale) / 2,
        scale,
        width,
      }
    }
    function logicalViewport() {
      const metrics = contentMetrics()
      if (!metrics) return null
      let x
      let y
      let width
      let height
      if (browser.innerWidth <= 720 && container.hasAttribute('data-wide-diagram')) {
        x = viewBox.x + container.scrollLeft / metrics.scale
        y = viewBox.y
        width = Math.min(viewBox.width, Math.max(1, container.clientWidth / metrics.scale))
        height = viewBox.height
      } else {
        x = viewBox.x + (-state.x / state.scale - metrics.offsetX) / metrics.scale
        y = viewBox.y + (-state.y / state.scale - metrics.offsetY) / metrics.scale
        width = Math.min(viewBox.width, metrics.width / state.scale / metrics.scale)
        height = Math.min(viewBox.height, metrics.height / state.scale / metrics.scale)
      }
      width = Math.max(1, Math.min(viewBox.width, width))
      height = Math.max(1, Math.min(viewBox.height, height))
      x = Math.max(viewBox.x, Math.min(viewBox.x + viewBox.width - width, x))
      y = Math.max(viewBox.y, Math.min(viewBox.y + viewBox.height - height, y))
      return { height, scale: state.scale, width, x, y }
    }
    function detailLevel() {
      if (state.mode === 'semantic') return 'full'
      if (state.scale >= 1.75) return 'full'
      if (state.scale >= 1) return 'read'
      return 'map'
    }
    function renderControls() {
      const semantic = state.mode === 'semantic' && state.scale > 1.01
      const detail = detailLevel()
      const percent = Math.round(state.scale * 100) + '%'
      const levelLabel = viewerText('viewer.nav.level.' + detail)
      const detailHint =
        detail === 'map'
          ? viewerText('viewer.nav.detail.map')
          : detail === 'read'
            ? viewerText('viewer.nav.detail.read')
            : viewerText('viewer.nav.detail.full')
      const resolvedLevel = semantic ? viewerText('viewer.nav.level.auto') : levelLabel
      const showDetailLevel = semantic || detail !== 'read'
      if (resetDetailLabel) {
        resetDetailLabel.textContent = resolvedLevel
        resetDetailLabel.hidden = !showDetailLevel
      }
      if (resetPercentLabel) resetPercentLabel.textContent = percent
      resetBtn.toggleAttribute('data-detail-visible', showDetailLevel)
      resetBtn.title = viewerText('viewer.nav.camera.title', {
        hint: detailHint,
        semantic: semantic ? viewerText('viewer.nav.camera.semantic') : '',
      })
      resetBtn.setAttribute('aria-label', viewerText('viewer.nav.camera', { hint: detailHint }))
      resetBtn.setAttribute('data-detail-level', detail)
      container.setAttribute('data-detail-level', detail)
      container.setAttribute('data-camera-mode', state.mode)
      container.setAttribute('data-camera-indicator', semantic ? 'true' : 'false')
    }
    function clipToViewport(camera) {
      camera = camera || state
      if (camera.scale <= 1.001) {
        svg.style.removeProperty('clip-path')
        return
      }
      const width = svg.clientWidth || 1
      const height = svg.clientHeight || 1
      const scale = camera.scale
      const top = Math.max(0, Math.min(height, -camera.y / scale))
      const left = Math.max(0, Math.min(width, -camera.x / scale))
      const right = Math.max(0, Math.min(width, width - (width - camera.x) / scale))
      const bottom = Math.max(0, Math.min(height, height - (height - camera.y) / scale))
      svg.style.clipPath =
        'inset(' +
        [top, right, bottom, left]
          .map(function (value) {
            return Math.round(value * 1e3) / 1e3 + 'px'
          })
          .join(' ') +
        ')'
    }
    function cameraSettled(rendered) {
      return (
        Math.abs(rendered.scale - state.scale) < 1e-3 &&
        Math.abs(rendered.x - state.x) < 0.05 &&
        Math.abs(rendered.y - state.y) < 0.05
      )
    }
    function syncViewportClip() {
      if (clipFrame) cancelAnimationFrame(clipFrame)
      clipFrame = 0
      function sample() {
        clipFrame = 0
        const rendered = sampleRenderedState()
        clipToViewport(rendered)
        if (!cameraSettled(rendered)) clipFrame = requestAnimationFrame(sample)
      }
      sample()
    }
    function apply() {
      clamp()
      svg.style.transform = 'translate(' + state.x + 'px,' + state.y + 'px) scale(' + state.scale + ')'
      syncViewportClip()
      renderControls()
      outBtn.disabled = state.scale <= 1
      inBtn.disabled = state.scale >= 3
      container.classList.toggle('is-pannable', state.scale > 1)
      svg.setAttribute('data-view-scale', String(state.scale))
      if (Archify.radar && typeof Archify.radar.sync === 'function') Archify.radar.sync()
      if (Archify.viewerChromeLayout && typeof Archify.viewerChromeLayout.schedule === 'function') {
        Archify.viewerChromeLayout.schedule()
      }
    }
    function sampleRenderedState() {
      let transform = ''
      try {
        transform = getComputedStyle(svg).transform || ''
      } catch (_) {
        reportArchifyFailure(_)
      }
      const match = transform.match(/^matrix\(([^)]+)\)$/)
      if (!match) return { mode: state.mode, scale: state.scale, x: state.x, y: state.y }
      const values = match[1].split(',').map(Number)
      if (values.length !== 6 || !values.every(Number.isFinite)) {
        return { mode: state.mode, scale: state.scale, x: state.x, y: state.y }
      }
      return { mode: state.mode, scale: values[0], x: values[4], y: values[5] }
    }
    function finishCameraTransaction(transaction, outcome) {
      if (!transaction || transaction.settled) return false
      transaction.settled = true
      transaction.state = outcome || 'complete'
      if (transaction.frame) cancelAnimationFrame(transaction.frame)
      if (transaction.timer) clearTimeout(transaction.timer)
      transaction.frame = null
      transaction.timer = null
      if (cameraTransaction === transaction) cameraTransaction = null
      cameraFrame = null
      cameraTimer = null
      container.classList.remove('is-camera-moving')
      container.classList.remove('is-camera-transaction')
      container.removeAttribute('data-camera-transaction')
      if (Archify.focus && Archify.focus.reposition) Archify.focus.reposition()
      transaction.resolve({ id: transaction.id, state: transaction.state })
      return true
    }
    function cameraReceipt(target) {
      let resolver
      const transaction = {
        cancel: function (reason, commitTarget) {
          if (transaction.settled) return false
          if (commitTarget && transaction.target) {
            if (Object.prototype.hasOwnProperty.call(transaction.target, 'scrollLeft')) {
              container.scrollLeft = transaction.target.scrollLeft
            } else {
              state = {
                mode: transaction.target.mode,
                scale: transaction.target.scale,
                x: transaction.target.x,
                y: transaction.target.y,
              }
              apply()
            }
          }
          return finishCameraTransaction(transaction, reason || 'cancelled')
        },
        finished: new Promise(function (resolve) {
          resolver = resolve
        }),
        frame: null,
        id: ++cameraGeneration,
        resolve: resolver,
        settled: false,
        state: 'running',
        target,
        timer: null,
      }
      return transaction
    }
    function stopCameraMotion(reason, commitTarget) {
      if (cameraTransaction && !cameraTransaction.settled) {
        cameraTransaction.cancel(reason || 'cancelled', commitTarget === true)
        return
      }
      if (cameraTimer) clearTimeout(cameraTimer)
      if (cameraFrame) cancelAnimationFrame(cameraFrame)
      cameraTimer = null
      cameraFrame = null
      container.classList.remove('is-camera-moving')
      container.classList.remove('is-camera-transaction')
      container.removeAttribute('data-camera-transaction')
    }
    function interruptCamera(reason) {
      if (Archify.guidedViews && Archify.guidedViews.cancelHandoff) {
        Archify.guidedViews.cancelHandoff(reason || 'manual')
      }
      const rendered = sampleRenderedState()
      stopCameraMotion(reason || 'manual', false)
      state = rendered
      state.mode = 'manual'
      apply()
      renderControls()
      if (Archify.guidedViews && Archify.guidedViews.isPlaying && Archify.guidedViews.isPlaying()) {
        Archify.guidedViews.pause()
      }
      if (Archify.routeProbe && Archify.routeProbe.isJourneyPlaying && Archify.routeProbe.isJourneyPlaying()) {
        Archify.routeProbe.pauseJourney({ preserveElapsed: true, reason: reason || 'manual' })
      }
    }
    function zoom(next, options) {
      options = options || {}
      if (options.manual !== false) interruptCamera()
      const previous = state.scale
      next = Math.max(1, Math.min(3, Math.round(next * 4) / 4))
      if (next === previous) return
      const centerX = (svg.clientWidth || 1) / 2
      const centerY = (svg.clientHeight || 1) / 2
      const contentX = (centerX - state.x) / previous
      const contentY = (centerY - state.y) / previous
      state.scale = next
      state.x = centerX - contentX * next
      state.y = centerY - contentY * next
      apply()
    }
    function reset(options) {
      options = options || {}
      if (options.automatic !== true) interruptCamera()
      else stopCameraMotion('reset', false)
      state = { mode: 'overview', scale: 1, x: 0, y: 0 }
      apply()
    }
    function centerAt(logicalX, logicalY, options) {
      options = options || {}
      logicalX = Number(logicalX)
      logicalY = Number(logicalY)
      const metrics = contentMetrics()
      if (!metrics || !Number.isFinite(logicalX) || !Number.isFinite(logicalY)) return false
      interruptCamera()
      if (browser.innerWidth <= 720 && container.hasAttribute('data-wide-diagram')) {
        state.scale = 1
        state.x = 0
        state.y = 0
        state.mode = 'manual'
        apply()
        let mobileTarget = (logicalX - viewBox.x) * metrics.scale - container.clientWidth / 2
        mobileTarget = Math.max(0, Math.min(svg.clientWidth - container.clientWidth, mobileTarget))
        autoScrollUntil = Date.now() + 80
        try {
          container.scrollTo({ behavior: options.instant ? 'auto' : 'smooth', left: mobileTarget })
        } catch (_) {
          reportArchifyFailure(_)
          container.scrollLeft = mobileTarget
        }
        return true
      }
      const minimumScale = Math.max(1, Math.min(3, Number(options.minimumScale) || 1))
      const requestedScale = Number(options.scale)
      state.scale = Math.max(minimumScale, Math.min(3, Number.isFinite(requestedScale) ? requestedScale : state.scale))
      const contentX = metrics.offsetX + (logicalX - viewBox.x) * metrics.scale
      const contentY = metrics.offsetY + (logicalY - viewBox.y) * metrics.scale
      state.x = metrics.width / 2 - contentX * state.scale
      state.y = metrics.height / 2 - contentY * state.scale
      state.mode = 'manual'
      apply()
      if (Archify.focus && Archify.focus.reposition) Archify.focus.reposition()
      return true
    }
    function semanticIds(ids, includeNeighbors) {
      const seeds = {}
      const wanted = {}
      ;(ids || []).forEach(function (id) {
        seeds[id] = true
        wanted[id] = true
      })
      if (includeNeighbors) {
        Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'), function (edge) {
          const from = edge.getAttribute('data-edge-from')
          const to = edge.getAttribute('data-edge-to')
          if (seeds[from] || seeds[to]) {
            wanted[from] = true
            wanted[to] = true
          }
        })
      }
      return wanted
    }
    function boxesFor(ids, includeNeighbors) {
      const wanted = semanticIds(ids, includeNeighbors)
      return Array.prototype.slice
        .call(svg.querySelectorAll('[data-node-id]'))
        .filter(function (node) {
          return wanted[node.getAttribute('data-node-id')]
        })
        .map(function (node) {
          try {
            return node.getBBox()
          } catch (_) {
            reportArchifyFailure(_)
            return null
          }
        })
        .filter(Boolean)
    }
    function frameDesktop(ids, options) {
      options = options || {}
      const boxes = boxesFor(ids, options.includeNeighbors === true)
      if (!boxes.length || !viewBox || viewBox.width <= 0 || viewBox.height <= 0) return false
      const svgWidth = svg.clientWidth || 1
      const svgHeight = svg.clientHeight || 1
      const contentScale = Math.min(svgWidth / viewBox.width, svgHeight / viewBox.height)
      const contentOffsetX = (svgWidth - viewBox.width * contentScale) / 2
      const contentOffsetY = (svgHeight - viewBox.height * contentScale) / 2
      const minX = Math.min.apply(
        Math,
        boxes.map(function (box) {
          return box.x
        }),
      )
      const minY = Math.min.apply(
        Math,
        boxes.map(function (box) {
          return box.y
        }),
      )
      const maxX = Math.max.apply(
        Math,
        boxes.map(function (box) {
          return box.x + box.width
        }),
      )
      const maxY = Math.max.apply(
        Math,
        boxes.map(function (box) {
          return box.y + box.height
        }),
      )
      const bounds = {
        height: Math.max(1, (maxY - minY) * contentScale),
        width: Math.max(1, (maxX - minX) * contentScale),
        x: contentOffsetX + minX * contentScale,
        y: contentOffsetY + minY * contentScale,
      }
      const padding = options.padding || 48
      let left = padding
      const right = svgWidth - padding
      let top = padding
      let bottom = svgHeight - Math.max(padding, 72)
      const containerRect = container.getBoundingClientRect()
      const visibleTop = Math.max(0, -containerRect.top)
      const visibleBottom = Math.min(svgHeight, browser.innerHeight - containerRect.top)
      if (visibleBottom - visibleTop >= 240) {
        top = Math.max(top, visibleTop + padding)
        bottom = Math.min(bottom, visibleBottom - Math.max(padding, 72))
      }
      const chip = document.getElementById('focus-chip')
      if (chip && !chip.hidden) {
        const lensEnd = chip.offsetLeft + chip.offsetWidth + 24 - (svg.offsetLeft || 0)
        left = Math.max(left, Math.min(svgWidth * 0.42, lensEnd))
      }
      const routeReceipt = document.getElementById('route-probe')
      if (routeReceipt && !routeReceipt.hidden && routeReceipt.hasAttribute('data-route-journey')) {
        const receiptTop = routeReceipt.offsetTop
        const receiptBottom = receiptTop + routeReceipt.offsetHeight
        if (receiptTop < svgHeight / 2) top = Math.max(top, receiptBottom + 24)
        else bottom = Math.min(bottom, receiptTop - 24)
      }
      if (right <= left || bottom <= top) return false
      const maxScale = options.maxScale || (options.includeNeighbors ? 1.9 : 2.15)
      let targetScale = Math.min((right - left) / bounds.width, (bottom - top) / bounds.height) * 0.9
      targetScale = Math.max(1, Math.min(maxScale, targetScale))
      if (targetScale < 1.08) targetScale = 1
      const target = {
        mode: 'semantic',
        scale: Math.round(targetScale * 100) / 100,
        x: 0,
        y: 0,
      }
      target.x = (left + right) / 2 - (bounds.x + bounds.width / 2) * target.scale
      target.y = (top + bottom) / 2 - (bounds.y + bounds.height / 2) * target.scale
      const start = sampleRenderedState()
      stopCameraMotion('replaced', false)
      const transaction = cameraReceipt(target, options)
      cameraTransaction = transaction
      const instant = options.instant === true || reducedMotion() || document.hidden
      if (instant) {
        state = target
        apply()
        finishCameraTransaction(
          transaction,
          reducedMotion() ? 'reduced-motion' : document.hidden ? 'hidden' : 'complete',
        )
        return transaction
      }
      const duration = Math.max(180, Math.min(520, Number(options.duration) || 420))
      let startedAt = 0
      state = start
      state.mode = 'semantic'
      apply()
      container.classList.add('is-camera-moving')
      container.classList.add('is-camera-transaction')
      container.setAttribute('data-camera-transaction', String(transaction.id))
      const step = function (timestamp) {
        if (cameraTransaction !== transaction || transaction.settled) return
        if (!startedAt) startedAt = timestamp
        const fraction = Math.max(0, Math.min(1, (timestamp - startedAt) / duration))
        const eased = 1 - Math.pow(1 - fraction, 3)
        state = {
          mode: 'semantic',
          scale: start.scale + (target.scale - start.scale) * eased,
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
        }
        apply()
        if (fraction < 1) {
          transaction.frame = requestAnimationFrame(step)
          cameraFrame = transaction.frame
        } else {
          state = target
          apply()
          finishCameraTransaction(transaction, 'complete')
        }
      }
      transaction.frame = requestAnimationFrame(step)
      cameraFrame = transaction.frame
      return transaction
    }
    function reveal(ids, options) {
      options = options || {}
      if (browser.innerWidth > 720) return frameDesktop(ids, options)
      stopCameraMotion('replaced', false)
      state.scale = 1
      state.x = 0
      state.y = 0
      state.mode = 'semantic'
      apply()
      if (!container.hasAttribute('data-wide-diagram')) {
        const contained = cameraReceipt({ mode: 'semantic', scale: 1, x: 0, y: 0 }, options)
        cameraTransaction = contained
        finishCameraTransaction(contained, 'complete')
        return contained
      }
      const boxes = boxesFor(ids, options.includeNeighbors === true)
      if (!boxes.length || !viewBox || viewBox.width <= 0) return false
      const minX = Math.min.apply(
        Math,
        boxes.map(function (box) {
          return box.x
        }),
      )
      const maxX = Math.max.apply(
        Math,
        boxes.map(function (box) {
          return box.x + box.width
        }),
      )
      const center = ((minX + maxX) / 2 / viewBox.width) * (svg.clientWidth || 1)
      const target = Math.max(0, Math.min(svg.clientWidth - container.clientWidth, center - container.clientWidth / 2))
      const transaction = cameraReceipt({ scrollLeft: target }, options)
      cameraTransaction = transaction
      const instant = options.instant === true || reducedMotion() || document.hidden
      autoScrollUntil = Date.now() + (instant ? 50 : 470)
      try {
        container.scrollTo({ behavior: instant ? 'auto' : 'smooth', left: target })
      } catch (_) {
        reportArchifyFailure(_)
        container.scrollLeft = target
      }
      if (instant)
        finishCameraTransaction(
          transaction,
          reducedMotion() ? 'reduced-motion' : document.hidden ? 'hidden' : 'complete',
        )
      else {
        transaction.timer = setTimeout(function () {
          finishCameraTransaction(transaction, 'complete')
        }, 460)
        cameraTimer = transaction.timer
        container.classList.add('is-camera-moving')
        container.setAttribute('data-camera-transaction', String(transaction.id))
      }
      return transaction
    }
    function syncSemantic() {
      const guided =
        Archify.guidedViews && typeof Archify.guidedViews.focus === 'function' ? Archify.guidedViews.focus() : []
      if (guided && guided.length) return reveal(guided, { reason: 'guided-sync' })
      const active = Archify.focus && typeof Archify.focus.active === 'function' ? Archify.focus.active() : null
      if (typeof active === 'string') return reveal([active], { includeNeighbors: true, reason: 'focus-sync' })
      if (Array.isArray(active) && active.length) return reveal(active, { reason: 'selection-sync' })
      return false
    }
    function pinControls() {
      container.style.setProperty('--archify-scroll-x', container.scrollLeft + 'px')
    }
    function onScroll() {
      pinControls()
      if (Archify.radar && typeof Archify.radar.sync === 'function') Archify.radar.sync()
      if (browser.innerWidth <= 720 && container.hasAttribute('data-wide-diagram') && Date.now() > autoScrollUntil) {
        interruptCamera()
      }
    }
    function onPointerEnd(event) {
      if (!drag) return
      const moved = drag.moved
      drag = null
      container.classList.remove('is-panning')
      try {
        container.releasePointerCapture(event.pointerId)
      } catch (_) {
        reportArchifyFailure(_)
      }
      if (moved) {
        container.setAttribute('data-just-panned', 'true')
        setTimeout(function () {
          container.removeAttribute('data-just-panned')
        }, 80)
      }
    }
    inBtn.addEventListener('click', function () {
      zoom(state.scale + 0.25)
    })
    outBtn.addEventListener('click', function () {
      zoom(state.scale - 0.25)
    })
    resetBtn.addEventListener('click', reset)
    container.addEventListener('pointerdown', function (event) {
      if (
        state.scale <= 1 ||
        event.button !== 0 ||
        event.target.closest(
          '.diagram-nav, .focus-chip, .node-finder, .diagram-guide, .overview-map, .route-probe, .semantic-lens',
        ) ||
        event.target.closest('[data-node-id]') ||
        event.target.closest('[data-relationship-hit-key]')
      )
        return
      interruptCamera()
      drag = { moved: false, startX: event.clientX, startY: event.clientY, x: state.x, y: state.y }
      container.classList.add('is-panning')
      try {
        container.setPointerCapture(event.pointerId)
      } catch (_) {
        reportArchifyFailure(_)
      }
    })
    container.addEventListener('pointermove', function (event) {
      if (!drag) return
      const dx = event.clientX - drag.startX
      const dy = event.clientY - drag.startY
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
      state.x = drag.x + dx
      state.y = drag.y + dy
      apply()
    })
    container.addEventListener('pointerup', onPointerEnd)
    container.addEventListener('pointercancel', onPointerEnd)
    container.addEventListener('scroll', onScroll, { passive: true })
    browser.addEventListener('resize', function () {
      if (resizeFrame) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(function () {
        resizeFrame = 0
        if (state.mode === 'semantic') syncSemantic()
        else apply()
      })
    })
    browser.addEventListener('hashchange', function () {
      requestAnimationFrame(syncSemantic)
    })
    apply()
    pinControls()
    requestAnimationFrame(syncSemantic)
    return {
      centerAt,
      logicalViewport,
      reset,
      reveal,
      state: function () {
        return { mode: state.mode, scale: state.scale, x: state.x, y: state.y }
      },
      sync: syncSemantic,
      zoomIn: function () {
        zoom(state.scale + 0.25)
      },
      zoomOut: function () {
        zoom(state.scale - 0.25)
      },
    }
  })()
  Archify.radar = (function () {
    const container = document.querySelector('.diagram-container')
    const diagram = container.querySelector(':scope > svg')
    const panel = document.getElementById('overview-map')
    const panelHead = panel.querySelector('.overview-map-head')
    const surface = document.getElementById('overview-map-surface')
    const status = document.getElementById('overview-map-status')
    const trigger = document.getElementById('btn-overview-map')
    const closeBtn = document.getElementById('overview-map-close')
    const expandBtn = document.getElementById('overview-map-expand')
    const feedback = document.getElementById('overview-map-feedback')
    const navigation = container.querySelector('.diagram-nav')
    const passport = document.getElementById('focus-chip')
    const namespace = 'http://www.w3.org/2000/svg'
    const viewBox = diagram.viewBox && diagram.viewBox.baseVal
    const mapSvg = document.createElementNS(namespace, 'svg')
    const nodeLayer = document.createElementNS(namespace, 'g')
    const viewport = document.createElementNS(namespace, 'rect')
    let nodes = []
    let viewportDrag = null
    let panelDrag = null
    let manualPosition = null
    let lastPlacement = null
    let requestedOpen = false
    let passportYielded = false
    let passportPreviousAriaHidden = null
    let syncFrame = 0
    let spaceRetryTimer = 0
    let spaceRetryCount = 0
    const placementGap = 16
    mapSvg.setAttribute('role', 'group')
    mapSvg.setAttribute('aria-label', viewerText('viewer.radar.nodes'))
    mapSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    nodeLayer.setAttribute('class', 'overview-map-nodes')
    viewport.setAttribute('class', 'overview-map-viewport')
    viewport.setAttribute('rx', '3')
    viewport.setAttribute('ry', '3')
    mapSvg.appendChild(nodeLayer)
    mapSvg.appendChild(viewport)
    surface.appendChild(mapSvg)
    function nodeLabel(node, fallback) {
      return (
        node.getAttribute('data-node-label') ||
        (node.getAttribute('aria-label') || fallback).replace(/^Focus\s+/, '').split(',')[0]
      )
    }
    function build() {
      if (!viewBox || viewBox.width <= 0 || viewBox.height <= 0) return false
      mapSvg.setAttribute('viewBox', [viewBox.x, viewBox.y, viewBox.width, viewBox.height].join(' '))
      nodeLayer.textContent = ''
      nodes = []
      Array.prototype.forEach.call(diagram.querySelectorAll('[data-node-id]'), function (node) {
        let box
        try {
          box = node.getBBox()
        } catch (_) {
          reportArchifyFailure(_)
          box = null
        }
        if (!box || box.width <= 0 || box.height <= 0) return
        const id = node.getAttribute('data-node-id')
        const rect = document.createElementNS(namespace, 'rect')
        rect.setAttribute('class', 'overview-map-node')
        rect.setAttribute('x', String(box.x))
        rect.setAttribute('y', String(box.y))
        rect.setAttribute('width', String(Math.max(3, box.width)))
        rect.setAttribute('height', String(Math.max(3, box.height)))
        rect.setAttribute('rx', String(Math.max(2, Math.min(8, Math.min(box.width, box.height) * 0.1))))
        rect.setAttribute('data-radar-node-id', id)
        rect.setAttribute('data-kind', node.getAttribute('data-node-kind') || 'neutral')
        rect.setAttribute('tabindex', '0')
        rect.setAttribute('role', 'button')
        rect.setAttribute('aria-label', viewerText('viewer.radar.focus', { label: nodeLabel(node, id) }))
        nodeLayer.appendChild(rect)
        nodes.push({ id, node, rect })
      })
      status.textContent = viewerText('viewer.radar.fullMap', { count: nodes.length })
      return true
    }
    function visibleRect(element) {
      if (!element || element.hidden) return null
      const rect = element.getBoundingClientRect()
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= browser.innerWidth ||
        rect.top >= browser.innerHeight
      )
        return null
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      }
    }
    function panelRectAt(position) {
      return {
        bottom: position.top + panel.offsetHeight,
        height: panel.offsetHeight,
        left: position.left,
        right: position.left + panel.offsetWidth,
        top: position.top,
        width: panel.offsetWidth,
      }
    }
    function rectsIntersect(first, second, gap) {
      gap = Number(gap) || 0
      return (
        first.left < second.right + gap &&
        first.right > second.left - gap &&
        first.top < second.bottom + gap &&
        first.bottom > second.top - gap
      )
    }
    function intersectionArea(first, second) {
      const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
      const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top))
      return width * height
    }
    function clamp(value, minimum, maximum) {
      if (maximum < minimum) return minimum
      return Math.max(minimum, Math.min(maximum, value))
    }
    function placementContext() {
      const containerRect = visibleRect(container)
      if (!containerRect) return null
      const controlRect = visibleRect(navigation)
      const left = Math.max(placementGap, containerRect.left + placementGap)
      const top = Math.max(placementGap, containerRect.top + placementGap)
      const right = Math.min(browser.innerWidth - placementGap, containerRect.right - placementGap)
      let bottom = Math.min(browser.innerHeight - placementGap, containerRect.bottom - placementGap)
      if (controlRect) bottom = Math.min(bottom, controlRect.top - placementGap)
      const lens = document.getElementById('focus-chip')
      const lensRect = visibleRect(lens)
      const legendRect = visibleRect(diagram.querySelector('[data-legend]'))
      const active = diagram.querySelector('[data-focus-selected]')
      const activeRect = visibleRect(active)
      return {
        bounds: { bottom, left, right, top },
        hardBlockers: [lensRect, controlRect, legendRect].filter(Boolean),
        preferredSide:
          !activeRect || activeRect.left + activeRect.width / 2 > browser.innerWidth / 2 ? 'left' : 'right',
        softBlockers: [activeRect].filter(Boolean),
      }
    }
    function positionIsValid(position, context) {
      if (!position || !context) return false
      const rect = panelRectAt(position)
      const bounds = context.bounds
      if (rect.left < bounds.left || rect.top < bounds.top || rect.right > bounds.right || rect.bottom > bounds.bottom)
        return false
      return context.hardBlockers.every(function (blocker) {
        return !rectsIntersect(rect, blocker, placementGap)
      })
    }
    function cornerCandidates(context) {
      const bounds = context.bounds
      const left = bounds.left
      const right = Math.max(left, bounds.right - panel.offsetWidth)
      const top = bounds.top
      const bottom = Math.max(top, bounds.bottom - panel.offsetHeight)
      const preferredLeft = context.preferredSide === 'left' ? left : right
      const alternateLeft = context.preferredSide === 'left' ? right : left
      return [
        { left: preferredLeft, top: bottom },
        { left: alternateLeft, top: bottom },
        { left: preferredLeft, top },
        { left: alternateLeft, top },
      ].filter(function (candidate, index, all) {
        return (
          all.findIndex(function (other) {
            return other.left === candidate.left && other.top === candidate.top
          }) === index
        )
      })
    }
    function nearbyCandidates(context, reference) {
      const bounds = context.bounds
      const maximumLeft = bounds.right - panel.offsetWidth
      const maximumTop = bounds.bottom - panel.offsetHeight
      const requested = reference
        ? {
            left: clamp(reference.left, bounds.left, maximumLeft),
            top: clamp(reference.top, bounds.top, maximumTop),
          }
        : null
      let horizontal = [bounds.left, maximumLeft]
      let vertical = [bounds.top, maximumTop]
      if (requested) {
        horizontal.push(requested.left)
        vertical.push(requested.top)
      }
      context.hardBlockers.forEach(function (blocker) {
        horizontal.push(blocker.left - placementGap - panel.offsetWidth, blocker.right + placementGap)
        vertical.push(blocker.top - placementGap - panel.offsetHeight, blocker.bottom + placementGap)
      })
      horizontal = horizontal.map(function (left) {
        return clamp(left, bounds.left, maximumLeft)
      })
      vertical = vertical.map(function (top) {
        return clamp(top, bounds.top, maximumTop)
      })
      const candidates = []
      horizontal.forEach(function (left) {
        vertical.forEach(function (top) {
          candidates.push({ left, top })
        })
      })
      return candidates.filter(function (candidate, index, all) {
        return (
          all.findIndex(function (other) {
            return other.left === candidate.left && other.top === candidate.top
          }) === index
        )
      })
    }
    function placementScore(position, context, reference, softWeight) {
      const rect = panelRectAt(position)
      const referenceLeft = reference
        ? reference.left
        : context.preferredSide === 'left'
          ? context.bounds.left
          : context.bounds.right - panel.offsetWidth
      const referenceTop = reference ? reference.top : context.bounds.bottom - panel.offsetHeight
      const distance = Math.pow(position.left - referenceLeft, 2) + Math.pow(position.top - referenceTop, 2)
      const softOverlap = context.softBlockers.reduce(function (total, blocker) {
        return total + intersectionArea(rect, blocker)
      }, 0)
      return distance + softOverlap * softWeight
    }
    function chooseRadarPlacement(context, reference, options) {
      options = options || {}
      const softWeight = Number.isFinite(options.softWeight) ? options.softWeight : 100
      const candidates = nearbyCandidates(context, reference).concat(cornerCandidates(context))
      const valid = candidates.filter(function (candidate) {
        return positionIsValid(candidate, context)
      })
      valid.sort(function (first, second) {
        return (
          placementScore(first, context, reference, softWeight) - placementScore(second, context, reference, softWeight)
        )
      })
      return valid.length ? valid[0] : null
    }
    function applyPlacement(position, remember) {
      const useLeft = position.left + panel.offsetWidth / 2 <= browser.innerWidth / 2
      panel.setAttribute('data-docked', 'true')
      panel.setAttribute('data-dock-side', useLeft ? 'left' : 'right')
      if (useLeft) {
        panel.style.setProperty('--archify-radar-left', Math.round(position.left) + 'px')
        panel.style.removeProperty('--archify-radar-right')
      } else {
        panel.style.setProperty(
          '--archify-radar-right',
          Math.round(browser.innerWidth - position.left - panel.offsetWidth) + 'px',
        )
        panel.style.removeProperty('--archify-radar-left')
      }
      panel.style.setProperty('--archify-radar-top', Math.round(position.top) + 'px')
      if (remember !== false) lastPlacement = { left: position.left, top: position.top }
    }
    function resetDockingStyles() {
      panel.removeAttribute('data-docked')
      panel.removeAttribute('data-dock-side')
      panel.removeAttribute('data-panel-dragging')
      panel.removeAttribute('data-placement-invalid')
      panel.removeAttribute('data-placement-degraded')
      panel.removeAttribute('data-placement-unavailable')
      panel.removeAttribute('data-compact')
      panel.removeAttribute('title')
      panel.style.removeProperty('visibility')
      panel.style.removeProperty('--archify-radar-right')
      panel.style.removeProperty('--archify-radar-left')
      panel.style.removeProperty('--archify-radar-top')
    }
    function updateDocking() {
      const options = arguments[0] || {}
      if (panel.hidden) return false
      if (panelDrag) return true
      panel.removeAttribute('data-compact')
      panel.removeAttribute('data-placement-degraded')
      panel.removeAttribute('data-placement-invalid')
      panel.removeAttribute('data-placement-unavailable')
      panel.removeAttribute('title')
      panel.style.removeProperty('visibility')
      let context = placementContext()
      if (!context) {
        resetDockingStyles()
        return false
      }
      const reference = manualPosition || lastPlacement
      const placementOptions = { softWeight: manualPosition ? 0 : 100 }
      let placement =
        manualPosition && positionIsValid(manualPosition, context)
          ? manualPosition
          : chooseRadarPlacement(context, reference, placementOptions)
      let compact = false
      if (!placement && options.allowCompact !== false) {
        compact = true
        panel.setAttribute('data-compact', 'true')
        panel.setAttribute('data-placement-degraded', 'true')
        panel.setAttribute('title', viewerText('viewer.radar.compacted'))
        context = placementContext()
        placement = chooseRadarPlacement(context, reference, placementOptions)
      }
      if (!placement) {
        resetDockingStyles()
        panel.setAttribute('data-placement-unavailable', 'true')
        return false
      }
      if (manualPosition && !compact) manualPosition = { left: placement.left, top: placement.top }
      applyPlacement(placement, true)
      return true
    }
    function clearSpaceRetry() {
      if (spaceRetryTimer) browser.clearTimeout(spaceRetryTimer)
      spaceRetryTimer = 0
    }
    function yieldPassport() {
      if (!passport || passport.hidden || passportYielded) return passportYielded
      passportPreviousAriaHidden = passport.getAttribute('aria-hidden')
      passportYielded = true
      passport.setAttribute('data-radar-yielded', 'true')
      passport.setAttribute('aria-hidden', 'true')
      return true
    }
    function restorePassport() {
      if (!passport || !passportYielded) return
      passportYielded = false
      passport.removeAttribute('data-radar-yielded')
      if (passportPreviousAriaHidden === null) passport.removeAttribute('aria-hidden')
      else passport.setAttribute('aria-hidden', passportPreviousAriaHidden)
      passportPreviousAriaHidden = null
    }
    function reflectVisible() {
      panel.hidden = false
      panel.removeAttribute('data-placement-unavailable')
      trigger.setAttribute('aria-expanded', 'true')
      trigger.removeAttribute('data-radar-space-limited')
      trigger.setAttribute('aria-label', viewerText('viewer.radar.close'))
      trigger.title = viewerText('viewer.nav.radar.title')
      feedback.hidden = true
    }
    function scheduleSpaceRetry() {
      if (!requestedOpen || spaceRetryTimer || spaceRetryCount >= 4) return
      spaceRetryCount += 1
      spaceRetryTimer = browser.setTimeout(function () {
        spaceRetryTimer = 0
        attemptRequestedOpen()
      }, 60)
    }
    function reflectUnavailable() {
      restorePassport()
      panel.hidden = true
      panel.setAttribute('data-placement-unavailable', 'true')
      trigger.setAttribute('aria-expanded', 'false')
      trigger.setAttribute('aria-label', viewerText('viewer.radar.cancelWaiting'))
      trigger.setAttribute('data-radar-space-limited', 'true')
      trigger.title = viewerText('viewer.radar.needsSpace')
      feedback.hidden = false
      scheduleSpaceRetry()
    }
    function attemptRequestedOpen(options) {
      options = options || {}
      if (!requestedOpen) return false
      panel.hidden = false
      if (!updateDocking(options)) {
        reflectUnavailable()
        return false
      }
      clearSpaceRetry()
      spaceRetryCount = 0
      reflectVisible()
      sync()
      if (options.focus === true && !panel.hasAttribute('data-compact')) surface.focus()
      return true
    }
    function expandCompactRadar() {
      if (!requestedOpen || panel.hidden || !panel.hasAttribute('data-compact')) return false
      yieldPassport()
      if (!updateDocking({ allowCompact: false })) {
        restorePassport()
        if (!updateDocking()) {
          reflectUnavailable()
          return false
        }
      }
      reflectVisible()
      sync()
      if (!panel.hasAttribute('data-compact')) surface.focus()
      return !panel.hasAttribute('data-compact')
    }
    function syncNow() {
      syncFrame = 0
      if (panel.hidden || !Archify.view || typeof Archify.view.logicalViewport !== 'function') return
      if (!updateDocking()) {
        reflectUnavailable()
        return
      }
      if (passportYielded && panel.hasAttribute('data-compact')) {
        restorePassport()
        if (!updateDocking()) {
          reflectUnavailable()
          return
        }
      }
      reflectVisible()
      const visible = Archify.view.logicalViewport()
      if (!visible) return
      viewport.setAttribute('x', String(visible.x))
      viewport.setAttribute('y', String(visible.y))
      viewport.setAttribute('width', String(visible.width))
      viewport.setAttribute('height', String(visible.height))
      const full = visible.width >= viewBox.width * 0.98 && visible.height >= viewBox.height * 0.98
      const mobileWide = browser.innerWidth <= 720 && container.hasAttribute('data-wide-diagram')
      const viewportCopy = full
        ? viewerText('viewer.radar.viewport.full')
        : mobileWide
          ? viewerText('viewer.radar.viewport.width', { percent: Math.round((visible.width / viewBox.width) * 100) })
          : viewerText('viewer.radar.viewport.scale', { percent: Math.round(visible.scale * 100) })
      status.textContent = viewerText('viewer.radar.status', { count: nodes.length, viewport: viewportCopy })
      nodes.forEach(function (item) {
        const active =
          item.node.hasAttribute('data-focus-selected') || item.node.getAttribute('data-story-beat-state') === 'active'
        if (active) item.rect.setAttribute('data-radar-active', 'true')
        else item.rect.removeAttribute('data-radar-active')
      })
    }
    function sync() {
      if (requestedOpen && panel.hidden) {
        attemptRequestedOpen()
        return
      }
      if (syncFrame) return
      syncFrame = requestAnimationFrame(syncNow)
    }
    function setOpen(next, options) {
      options = options || {}
      next = Boolean(next)
      if (next && Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
        Archify.semanticLens.clearPreview()
      if (next && Archify.semanticLens && Archify.semanticLens.isOpen()) {
        Archify.semanticLens.close({ restoreFocus: false })
      }
      requestedOpen = next
      if (next) {
        clearSpaceRetry()
        spaceRetryCount = 0
        build()
        attemptRequestedOpen(options)
      } else {
        clearSpaceRetry()
        spaceRetryCount = 0
        viewportDrag = null
        panelDrag = null
        container.classList.remove('is-panning')
        panel.hidden = true
        resetDockingStyles()
        restorePassport()
        feedback.hidden = true
        trigger.setAttribute('aria-expanded', 'false')
        trigger.removeAttribute('data-radar-space-limited')
        trigger.setAttribute('aria-label', viewerText('viewer.nav.radar'))
        trigger.title = viewerText('viewer.nav.radar.title')
        if (options.restoreFocus === true) trigger.focus()
      }
      return next
    }
    function toggle() {
      return setOpen(!requestedOpen, { focus: false })
    }
    function close(options) {
      return setOpen(false, options)
    }
    function bringNodeIntoWindow(node) {
      const delay = browser.matchMedia && browser.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 540
      browser.setTimeout(function () {
        const rect = node.getBoundingClientRect()
        const safeTop = 64
        const safeBottom = browser.innerHeight - 64
        if (rect.top >= safeTop && rect.bottom <= safeBottom) return
        const top = Math.max(0, browser.scrollY + rect.top + rect.height / 2 - browser.innerHeight / 2)
        try {
          browser.scrollTo({ behavior: delay ? 'smooth' : 'auto', top })
        } catch (_) {
          reportArchifyFailure(_)
          browser.scrollTo(0, top)
        }
      }, delay)
    }
    function focusNode(id) {
      const main = diagram.querySelector('[data-node-id="' + id + '"]')
      if (!main) return false
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, updateUrl: false })
      }
      if (Archify.focus && typeof Archify.focus.set === 'function') {
        Archify.focus.set(id, { toggle: false })
      }
      if (Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal([id], { includeNeighbors: true, reason: 'radar' })
      }
      bringNodeIntoWindow(main)
      try {
        main.focus({ preventScroll: true })
      } catch (_) {
        reportArchifyFailure(_)
        try {
          main.focus()
        } catch (_2) {
          reportArchifyFailure(_2)
        }
      }
      sync()
      return true
    }
    function diagramPoint(event) {
      const matrix = mapSvg.getScreenCTM()
      if (!matrix) return null
      const point = mapSvg.createSVGPoint()
      point.x = event.clientX
      point.y = event.clientY
      return point.matrixTransform(matrix.inverse())
    }
    function navigate(event) {
      const point = diagramPoint(event)
      if (!point || !Archify.view || typeof Archify.view.centerAt !== 'function') return
      Archify.view.centerAt(point.x, point.y, { instant: true, minimumScale: 1.5 })
      sync()
    }
    function endViewportDrag(event) {
      if (!viewportDrag) return
      viewportDrag = null
      panel.removeAttribute('data-dragging')
      container.classList.remove('is-panning')
      try {
        surface.releasePointerCapture(event.pointerId)
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function beginPanelDrag(event) {
      if (event.button !== 0 || event.target.closest('button, a, input, [role="button"]')) return
      const context = placementContext()
      if (!context) return
      const rect = panel.getBoundingClientRect()
      event.preventDefault()
      event.stopPropagation()
      panelDrag = {
        current: { left: rect.left, top: rect.top },
        originX: event.clientX,
        originY: event.clientY,
        pointerId: event.pointerId,
        previousManual: manualPosition ? { left: manualPosition.left, top: manualPosition.top } : null,
        start: { left: rect.left, top: rect.top },
      }
      panel.setAttribute('data-panel-dragging', 'true')
      try {
        panelHead.setPointerCapture(event.pointerId)
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function movePanelDrag(event) {
      if (!panelDrag || panelDrag.pointerId !== event.pointerId) return
      const context = placementContext()
      if (!context) return
      event.preventDefault()
      event.stopPropagation()
      const bounds = context.bounds
      const position = {
        left: clamp(
          panelDrag.start.left + event.clientX - panelDrag.originX,
          bounds.left,
          bounds.right - panel.offsetWidth,
        ),
        top: clamp(
          panelDrag.start.top + event.clientY - panelDrag.originY,
          bounds.top,
          bounds.bottom - panel.offsetHeight,
        ),
      }
      panelDrag.current = position
      if (positionIsValid(position, context)) panel.removeAttribute('data-placement-invalid')
      else panel.setAttribute('data-placement-invalid', 'true')
      applyPlacement(position, false)
    }
    function finishPanelDrag(event, cancel) {
      if (!panelDrag || panelDrag.pointerId !== event.pointerId) return
      event.preventDefault()
      event.stopPropagation()
      const activeDrag = panelDrag
      panelDrag = null
      panel.removeAttribute('data-panel-dragging')
      panel.removeAttribute('data-placement-invalid')
      try {
        panelHead.releasePointerCapture(event.pointerId)
      } catch (_) {
        reportArchifyFailure(_)
      }
      const context = placementContext()
      if (!context) return
      if (cancel) {
        manualPosition = activeDrag.previousManual
        lastPlacement = { left: activeDrag.start.left, top: activeDrag.start.top }
        updateDocking()
        return
      }
      const requested = activeDrag.current
      manualPosition = { left: requested.left, top: requested.top }
      updateDocking()
    }
    trigger.addEventListener('click', toggle)
    closeBtn.addEventListener('click', function () {
      close({ restoreFocus: true })
    })
    expandBtn.addEventListener('click', expandCompactRadar)
    panelHead.addEventListener('pointerdown', beginPanelDrag)
    panelHead.addEventListener('pointermove', movePanelDrag)
    panelHead.addEventListener('pointerup', function (event) {
      finishPanelDrag(event, false)
    })
    panelHead.addEventListener('pointercancel', function (event) {
      finishPanelDrag(event, true)
    })
    surface.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || event.target.closest('[data-radar-node-id]')) return
      event.preventDefault()
      viewportDrag = { pointerId: event.pointerId }
      panel.setAttribute('data-dragging', 'true')
      container.classList.add('is-panning')
      try {
        surface.setPointerCapture(event.pointerId)
      } catch (_) {
        reportArchifyFailure(_)
      }
      navigate(event)
    })
    surface.addEventListener('pointermove', function (event) {
      if (!viewportDrag || viewportDrag.pointerId !== event.pointerId) return
      navigate(event)
    })
    surface.addEventListener('pointerup', endViewportDrag)
    surface.addEventListener('pointercancel', endViewportDrag)
    surface.addEventListener('click', function (event) {
      const node = event.target.closest('[data-radar-node-id]')
      if (node) focusNode(node.getAttribute('data-radar-node-id'))
    })
    surface.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close({ restoreFocus: true })
        return
      }
      const node = event.target.closest('[data-radar-node-id]')
      if (node && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        focusNode(node.getAttribute('data-radar-node-id'))
        return
      }
      if (
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'ArrowDown'
      )
        return
      const visible = Archify.view && Archify.view.logicalViewport ? Archify.view.logicalViewport() : null
      if (!visible) return
      event.preventDefault()
      let x = visible.x + visible.width / 2
      let y = visible.y + visible.height / 2
      const stepX = Math.max(12, visible.width * 0.24)
      const stepY = Math.max(12, visible.height * 0.24)
      if (event.key === 'ArrowLeft') x -= stepX
      else if (event.key === 'ArrowRight') x += stepX
      else if (event.key === 'ArrowUp') y -= stepY
      else y += stepY
      Archify.view.centerAt(x, y, { instant: true, minimumScale: 1.5 })
      sync()
    })
    document.addEventListener(
      'keydown',
      function (event) {
        if (!panelDrag || event.key !== 'Escape') return
        finishPanelDrag(
          {
            pointerId: panelDrag.pointerId,
            preventDefault: function () {
              event.preventDefault()
            },
            stopPropagation: function () {
              event.stopPropagation()
            },
          },
          true,
        )
      },
      true,
    )
    function reflow() {
      if (!requestedOpen) return
      clearSpaceRetry()
      spaceRetryCount = 0
      sync()
    }
    browser.addEventListener('resize', reflow)
    browser.addEventListener('scroll', reflow, { passive: true })
    if (typeof ResizeObserver === 'function') {
      const radarResizeObserver = new ResizeObserver(function (entries) {
        if (!requestedOpen) return
        if (
          panel.hidden &&
          entries.every(function (entry) {
            return entry.target === panel
          })
        )
          return
        reflow()
      })
      ;[container, navigation, document.getElementById('focus-chip'), panel]
        .filter(Boolean)
        .forEach(function (element) {
          radarResizeObserver.observe(element)
        })
    }
    requestAnimationFrame(build)
    return {
      close,
      count: function () {
        return nodes.length
      },
      focus: focusNode,
      isOpen: function () {
        return requestedOpen
      },
      open: function () {
        return setOpen(true)
      },
      sync,
      toggle,
    }
  })()
  Archify.presentation = (function () {
    const html = document.documentElement
    const btn = document.getElementById('btn-present')
    const label = document.getElementById('present-label')
    let previousScrollY = 0
    function active() {
      return html.getAttribute('data-present') === 'true'
    }
    function updateUrl(next) {
      try {
        const url = new URL(browser.location.href)
        if (next) url.searchParams.set('present', '1')
        else url.searchParams.delete('present')
        history.replaceState(null, '', url.pathname + url.search + url.hash)
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function render(next) {
      btn.setAttribute('aria-pressed', next ? 'true' : 'false')
      btn.setAttribute('aria-label', viewerText(next ? 'viewer.present.exit' : 'viewer.present.enter'))
      btn.title = viewerText(next ? 'viewer.present.exit.title' : 'viewer.present.enter.title')
      label.textContent = viewerText(next ? 'viewer.present.exit.label' : 'viewer.present.present')
    }
    function setActive(next, options) {
      options = options || {}
      next = Boolean(next)
      if (next === active()) {
        render(next)
        return next
      }
      if (next) {
        if (Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
          Archify.semanticLens.clearPreview()
        previousScrollY = browser.scrollY || 0
        html.setAttribute('data-present', 'true')
        try {
          browser.scrollTo(0, 0)
        } catch (_) {
          reportArchifyFailure(_)
        }
      } else {
        html.removeAttribute('data-present')
      }
      render(next)
      if (options.updateUrl !== false) updateUrl(next)
      requestAnimationFrame(function () {
        if (Archify.view && typeof Archify.view.reset === 'function') {
          Archify.view.reset({ automatic: true })
          requestAnimationFrame(function () {
            if (Archify.view && typeof Archify.view.sync === 'function') Archify.view.sync()
          })
        }
        if (!next && previousScrollY) {
          try {
            browser.scrollTo(0, previousScrollY)
          } catch (_) {
            reportArchifyFailure(_)
          }
        }
      })
      return next
    }
    function toggle() {
      return setActive(!active())
    }
    render(active())
    btn.addEventListener('click', toggle)
    return {
      active,
      enter: function () {
        return setActive(true)
      },
      exit: function () {
        return setActive(false)
      },
      toggle,
    }
  })()
  Archify.finder = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector('svg')
    const trigger = document.getElementById('btn-node-finder')
    const panel = document.getElementById('node-finder')
    const heading = document.getElementById('node-finder-title')
    const closeBtn = document.getElementById('node-finder-close')
    const input = document.getElementById('node-finder-input')
    const results = document.getElementById('node-finder-results')
    const empty = document.getElementById('node-finder-empty')
    const status = document.getElementById('node-finder-status')
    let visibleItems = []
    function defaultContext() {
      return {
        allowedIds: null,
        availableNoun: viewerText('viewer.finder.noun.nodes'),
        badges: null,
        empty: viewerText('viewer.finder.empty'),
        kind: 'focus',
        placeholder: viewerText('viewer.finder.placeholder'),
        resultsLabel: viewerText('viewer.finder.results'),
        title: viewerText('viewer.finder.title'),
      }
    }
    let context = defaultContext()
    function semanticType(node) {
      const authored = node.getAttribute('data-node-kind')
      if (authored) return authored
      const types = ['frontend', 'backend', 'database', 'cloud', 'security', 'messagebus', 'external']
      return (
        types.find(function (type) {
          return node.querySelector('.c-' + type)
        }) || 'node'
      )
    }
    function connectionsFor(id) {
      let count = 0
      const seen = {}
      Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'), function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        const key = from + '\0' + to
        if ((from === id || to === id) && !seen[key]) {
          seen[key] = true
          count += 1
        }
      })
      return count
    }
    const items = Array.prototype.map.call(svg.querySelectorAll('[data-node-id]'), function (node) {
      const id = node.getAttribute('data-node-id')
      const label =
        node.getAttribute('data-node-label') || (node.getAttribute('aria-label') || id).replace(/^Focus\s+/, '')
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim()
      const sublabel = node.getAttribute('data-node-sublabel') || ''
      const context2 = node.getAttribute('data-node-context') || ''
      const tag = node.getAttribute('data-node-tag') || ''
      const brand = node.getAttribute('data-node-brand') || ''
      const type = semanticType(node)
      const sources = Archify.sourceEvidence.node(id)
      const sourceSearch = sources
        .map(function (source) {
          return [source.path, source.label, source.line, source.endLine].filter(Boolean).join(' ')
        })
        .join(' ')
      return {
        brand,
        context: context2,
        id,
        label,
        links: connectionsFor(id),
        node,
        search:
          (
            id +
            ' ' +
            label +
            ' ' +
            type +
            ' ' +
            sublabel +
            ' ' +
            context2 +
            ' ' +
            tag +
            ' ' +
            sourceSearch +
            ' ' +
            text
          ).toLowerCase() +
          ' ' +
          brand.toLowerCase(),
        sources,
        sublabel,
        tag,
        type,
      }
    })
    function resultButtons() {
      return Array.prototype.slice.call(results.querySelectorAll('.node-finder-result'))
    }
    function resolveContext(options) {
      let requested = options && options.context ? options.context : null
      if (!requested && Archify.routeProbe && typeof Archify.routeProbe.finderContext === 'function') {
        requested = Archify.routeProbe.finderContext()
      }
      if (!requested) return defaultContext()
      const resolved = defaultContext()
      Object.keys(requested).forEach(function (key) {
        resolved[key] = requested[key]
      })
      return resolved
    }
    function availableItems() {
      if (!context.allowedIds) return items.slice()
      return items.filter(function (item) {
        return context.allowedIds.indexOf(item.id) !== -1
      })
    }
    function applyContext() {
      panel.setAttribute('data-context', context.kind)
      heading.textContent = context.title
      input.placeholder = context.placeholder
      empty.textContent = context.empty
      results.setAttribute('aria-label', context.resultsLabel)
    }
    function select(id) {
      const item = items.find(function (candidate) {
        return candidate.id === id
      })
      if (!item) return false
      const routeSelection = context.kind === 'route-source' || context.kind === 'route-target'
      if (routeSelection) {
        if (!Archify.routeProbe || typeof Archify.routeProbe.choose !== 'function' || !Archify.routeProbe.choose(id))
          return false
        if (Archify.routeProbe.active() === 'target' && Archify.view && typeof Archify.view.reveal === 'function') {
          Archify.view.reveal([id], { includeNeighbors: true, reason: 'route-pick' })
        }
        close({ restoreFocus: false })
        try {
          item.node.focus({ preventScroll: true })
        } catch (_) {
          reportArchifyFailure(_)
          try {
            item.node.focus()
          } catch (_2) {
            reportArchifyFailure(_2)
          }
        }
        return true
      }
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, updateUrl: false })
      }
      if (Archify.view && typeof Archify.view.reset === 'function') Archify.view.reset({ automatic: true })
      Archify.focus.set(id, { toggle: false })
      if (Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal([id], { includeNeighbors: true, reason: 'finder' })
      }
      close({ restoreFocus: false })
      try {
        item.node.focus({ preventScroll: true })
      } catch (_) {
        reportArchifyFailure(_)
        try {
          item.node.focus()
        } catch (_2) {
          reportArchifyFailure(_2)
        }
      }
      return true
    }
    function render(query) {
      query = (query || '').trim().toLowerCase()
      const available = availableItems()
      visibleItems = available.filter(function (item) {
        return !query || item.search.indexOf(query) !== -1
      })
      results.textContent = ''
      visibleItems.forEach(function (item) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'node-finder-result'
        button.setAttribute('data-node-id', item.id)
        const badge =
          context.badges && context.badges[item.id]
            ? context.badges[item.id]
            : context.kind === 'focus'
              ? viewerCount('viewer.finder.link', item.links)
              : String(item.links)
        const action =
          context.kind === 'route-source'
            ? viewerText('viewer.finder.result.routeStart', { label: item.label })
            : context.kind === 'route-target'
              ? viewerText('viewer.finder.result.routeTarget', { label: item.label, links: badge })
              : viewerCount('viewer.finder.result.focus', item.links, { label: item.label })
        button.setAttribute('aria-label', action)
        const name = document.createElement('strong')
        name.textContent = item.label
        const links = document.createElement('em')
        links.textContent = badge
        links.title = context.kind === 'focus' ? badge : action
        const meta = document.createElement('small')
        meta.textContent = [viewerKindLabel(item.type), item.id, item.sublabel, item.tag].filter(Boolean).join(' \xB7 ')
        meta.title = [viewerKindLabel(item.type), item.id, item.context, item.sublabel, item.tag]
          .filter(Boolean)
          .join(' \xB7 ')
        button.appendChild(name)
        button.appendChild(links)
        button.appendChild(meta)
        button.addEventListener('click', function () {
          select(item.id)
        })
        results.appendChild(button)
      })
      empty.hidden = visibleItems.length !== 0
      status.textContent = query
        ? viewerText('viewer.finder.status.filtered', {
            available: available.length,
            noun: context.availableNoun,
            visible: visibleItems.length,
          })
        : viewerText('viewer.finder.status.all', { available: available.length, noun: context.availableNoun })
    }
    function open(options) {
      if (html.getAttribute('data-embed') === 'true') return false
      if (Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
        Archify.semanticLens.clearPreview()
      if (Archify.semanticLens && Archify.semanticLens.isOpen()) Archify.semanticLens.close({ restoreFocus: false })
      context = resolveContext(options || {})
      applyContext()
      panel.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      if (
        context.kind.indexOf('route-') === 0 &&
        Archify.routeProbe &&
        typeof Archify.routeProbe.finderOpening === 'function'
      ) {
        Archify.routeProbe.finderOpening()
      }
      input.value = ''
      render('')
      requestAnimationFrame(function () {
        input.focus()
      })
      return true
    }
    function close(options) {
      options = options || {}
      const routeContext = context.kind.indexOf('route-') === 0
      panel.hidden = true
      trigger.setAttribute('aria-expanded', 'false')
      input.value = ''
      if (routeContext && Archify.routeProbe && typeof Archify.routeProbe.finderClosed === 'function') {
        Archify.routeProbe.finderClosed({ restoreFocus: options.restoreFocus !== false })
      } else if (options.restoreFocus !== false) {
        trigger.focus()
      }
    }
    function toggle() {
      return panel.hidden ? open() : (close(), false)
    }
    trigger.addEventListener('click', toggle)
    closeBtn.addEventListener('click', function () {
      close()
    })
    input.addEventListener('input', function () {
      render(input.value)
    })
    input.addEventListener('keydown', function (event) {
      const buttons = resultButtons()
      if (event.key === 'ArrowDown' && buttons.length) {
        event.preventDefault()
        buttons[0].focus()
      } else if (event.key === 'Enter' && visibleItems.length) {
        event.preventDefault()
        select(visibleItems[0].id)
      }
    })
    results.addEventListener('keydown', function (event) {
      const buttons = resultButtons()
      const index = buttons.indexOf(document.activeElement)
      if (index < 0 || !buttons.length) return
      let next = null
      if (event.key === 'ArrowDown') next = (index + 1) % buttons.length
      else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = buttons.length - 1
      if (next !== null) {
        event.preventDefault()
        buttons[next].focus()
      }
    })
    panel.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    })
    document.addEventListener('click', function (event) {
      if (!panel.hidden && !panel.contains(event.target) && !event.target.closest('[data-node-finder-trigger]'))
        close({ restoreFocus: false })
    })
    render('')
    return {
      close,
      context: function () {
        return context.kind
      },
      count: items.length,
      isOpen: function () {
        return !panel.hidden
      },
      open,
      select,
      toggle,
    }
  })()
  Archify.routeProbe = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector(':scope > svg')
    const trigger = document.getElementById('btn-route-probe')
    const panel = document.getElementById('route-probe')
    const title = document.getElementById('route-probe-title')
    const path = document.getElementById('route-probe-path')
    const status = document.getElementById('route-probe-status')
    const findBtn = document.getElementById('route-probe-find')
    const copyBtn = document.getElementById('route-probe-copy')
    const clearBtn = document.getElementById('route-probe-clear')
    const journeyControls = document.getElementById('route-journey-controls')
    const journeyPrevBtn = document.getElementById('route-journey-prev')
    const journeyPlayBtn = document.getElementById('route-journey-play')
    const journeyPlayIcon = document.getElementById('route-journey-play-icon')
    const journeyPlayLabel = document.getElementById('route-journey-play-label')
    const journeyNextBtn = document.getElementById('route-journey-next')
    const journeyOverviewBtn = document.getElementById('route-journey-overview')
    const namespace = 'http://www.w3.org/2000/svg'
    let mode = 'idle'
    let startId = null
    let endId = null
    let activeNodeIds = []
    let activeEdges = []
    let journeyIndex = -1
    let journeyPlaying = false
    let journeyComplete = false
    let journeyGeneration = 0
    let journeyTimer = null
    let journeyStartedAt = 0
    let journeyElapsedMs = 0
    let journeyOwnerToken = 0
    const JOURNEY_DWELL_MS = 1100
    function nodes() {
      return Array.prototype.slice.call(svg.querySelectorAll('[data-node-id]'))
    }
    function edges() {
      return Array.prototype.slice.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'))
    }
    function nodesById() {
      const out = Object.create(null)
      nodes().forEach(function (node) {
        out[node.getAttribute('data-node-id')] = node
      })
      return out
    }
    function nodeLabel(node, fallback) {
      return (
        node.getAttribute('data-node-label') ||
        (node.getAttribute('aria-label') || fallback).replace(/^Focus\s+/, '').split(',')[0]
      )
    }
    function exportSnapshot() {
      if (mode !== 'result' || activeNodeIds.length < 2 || activeEdges.length !== activeNodeIds.length - 1) return null
      const allNodes = nodes()
      const byId = nodesById()
      const seenNodeIds = Object.create(null)
      const seenEdgeKeys = Object.create(null)
      if (
        startId !== activeNodeIds[0] ||
        endId !== activeNodeIds[activeNodeIds.length - 1] ||
        activeNodeIds.some(function (id) {
          if (
            seenNodeIds[id] ||
            allNodes.filter(function (node) {
              return node.getAttribute('data-node-id') === id
            }).length !== 1
          )
            return true
          seenNodeIds[id] = true
          return !byId[id]
        }) ||
        activeEdges.some(function (edge, index) {
          if (!edge || !svg.contains(edge)) return true
          const edgeKey = edge.getAttribute('data-edge-key')
          const edgeId = edge.getAttribute('data-edge-id') || ''
          if (!edgeKey || seenEdgeKeys[edgeKey]) return true
          seenEdgeKeys[edgeKey] = true
          const fragments = Array.prototype.slice
            .call(svg.querySelectorAll('[data-edge-key]'))
            .filter(function (candidate) {
              return candidate.getAttribute('data-edge-key') === edgeKey
            })
          const drawableFragments = fragments.filter(hasDrawableGeometry)
          return (
            !fragments.length ||
            !fragments.every(function (fragment) {
              return (
                fragment.getAttribute('data-edge-from') === activeNodeIds[index] &&
                fragment.getAttribute('data-edge-to') === activeNodeIds[index + 1] &&
                (fragment.getAttribute('data-edge-id') || '') === edgeId
              )
            }) ||
            drawableFragments.length !== 1 ||
            drawableFragments[0] !== edge ||
            edge.getAttribute('data-edge-from') !== activeNodeIds[index] ||
            edge.getAttribute('data-edge-to') !== activeNodeIds[index + 1]
          )
        })
      )
        return null
      return {
        edges: activeEdges.map(function (edge) {
          return {
            from: edge.getAttribute('data-edge-from'),
            id: edge.getAttribute('data-edge-id') || '',
            key: edge.getAttribute('data-edge-key'),
            label: edge.getAttribute('data-edge-label') || '',
            to: edge.getAttribute('data-edge-to'),
          }
        }),
        hops: activeEdges.length,
        nodeIds: activeNodeIds.slice(),
        source: { id: startId, label: nodeLabel(byId[startId], startId) },
        target: { id: endId, label: nodeLabel(byId[endId], endId) },
      }
    }
    function edgeShapes(edge) {
      if (/^(path|line|polyline)$/i.test(edge.tagName)) return [edge]
      return Array.prototype.slice.call(edge.querySelectorAll('path, line, polyline'))
    }
    function removeOverlay() {
      Array.prototype.forEach.call(svg.querySelectorAll('[data-route-probe-overlay]'), function (overlay) {
        overlay.remove()
      })
    }
    function removeJourneyPulse(options) {
      options = options || {}
      Array.prototype.forEach.call(svg.querySelectorAll('[data-route-journey-overlay]'), function (overlay) {
        overlay.remove()
      })
      if (journeyOwnerToken && options.release !== false && Archify.motionGovernor) {
        const token = journeyOwnerToken
        journeyOwnerToken = 0
        Archify.motionGovernor.release(token)
      }
    }
    function stopJourneyTimer(options) {
      options = options || {}
      journeyGeneration += 1
      if (journeyTimer) {
        if (options.preserveElapsed === true && journeyStartedAt) {
          journeyElapsedMs = Math.min(JOURNEY_DWELL_MS, journeyElapsedMs + Math.max(0, Date.now() - journeyStartedAt))
        }
        browser.clearTimeout(journeyTimer)
      }
      journeyTimer = null
      journeyStartedAt = 0
      if (options.preserveElapsed !== true) journeyElapsedMs = 0
    }
    function clearJourneyPresentation(options) {
      options = options || {}
      removeJourneyPulse()
      svg.removeAttribute('data-route-journey')
      panel.removeAttribute('data-route-journey')
      nodes().forEach(function (node) {
        node.removeAttribute('data-route-journey-state')
        node.removeAttribute('data-route-journey-current')
      })
      edges().forEach(function (edge) {
        edge.removeAttribute('data-route-journey-state')
        edge.removeAttribute('data-route-journey-current')
      })
      Array.prototype.forEach.call(path.querySelectorAll('[data-route-journey-index]'), function (button, index) {
        button.removeAttribute('data-route-journey-state')
        button.removeAttribute('aria-current')
        button.setAttribute('tabindex', index === 0 ? '0' : '-1')
      })
      if (options.keepControls !== true) journeyControls.hidden = true
      journeyControls.setAttribute('data-playing', 'false')
    }
    function resetJourneyState() {
      stopJourneyTimer()
      journeyPlaying = false
      journeyComplete = false
      journeyIndex = -1
      clearJourneyPresentation()
    }
    function cleanSvgState() {
      resetJourneyState()
      svg.removeAttribute('data-route-picking')
      svg.removeAttribute('data-route-active')
      removeOverlay()
      nodes().forEach(function (node) {
        node.removeAttribute('data-route-match')
        node.removeAttribute('data-route-start')
        node.removeAttribute('data-route-end')
        node.removeAttribute('data-route-step')
        node.removeAttribute('data-route-candidate')
        node.style.removeProperty('--route-step')
      })
      edges().forEach(function (edge) {
        edge.removeAttribute('data-route-match')
        edge.removeAttribute('data-route-step')
        edge.style.removeProperty('--route-step')
      })
      panel.removeAttribute('data-route-dock')
    }
    function replaceRouteHash(value) {
      try {
        history.replaceState(null, '', location.pathname + location.search + (value ? '#route=' + value : ''))
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function renderPlaceholder(copy) {
      path.textContent = ''
      const placeholder = document.createElement('span')
      placeholder.className = 'route-probe-placeholder'
      placeholder.textContent = copy
      path.appendChild(placeholder)
    }
    function renderPath(ids, options) {
      options = options || {}
      const byId = nodesById()
      path.textContent = ''
      ids.forEach(function (id, index) {
        if (index) {
          const arrow = document.createElement('span')
          arrow.className = 'route-probe-arrow'
          arrow.setAttribute('aria-hidden', 'true')
          arrow.textContent = '\u2192'
          path.appendChild(arrow)
        }
        const item = document.createElement(options.interactive === true ? 'button' : 'span')
        if (options.interactive === true) {
          item.type = 'button'
          item.setAttribute('data-route-journey-index', String(index))
          item.setAttribute('data-route-node-id', id)
          item.setAttribute('tabindex', index === 0 ? '0' : '-1')
          item.setAttribute(
            'aria-label',
            viewerText('viewer.route.position', {
              index: index + 1,
              label: nodeLabel(byId[id], id),
              total: ids.length,
            }),
          )
        }
        item.className = 'route-probe-node'
        item.textContent = nodeLabel(byId[id], id)
        item.title = nodeLabel(byId[id], id) + ' \xB7 ' + id
        if (index === 0) item.setAttribute('data-endpoint', 'start')
        if (index === ids.length - 1 && ids.length > 1) item.setAttribute('data-endpoint', 'end')
        path.appendChild(item)
      })
    }
    function setTrigger(active) {
      trigger.setAttribute('aria-pressed', active ? 'true' : 'false')
      trigger.setAttribute('aria-label', viewerText(active ? 'viewer.route.trigger.clear' : 'viewer.guide.route.aria'))
    }
    function clear(options) {
      options = options || {}
      const wasActive = mode !== 'idle'
      if (
        Archify.finder &&
        Archify.finder.isOpen() &&
        typeof Archify.finder.context === 'function' &&
        Archify.finder.context().indexOf('route-') === 0
      ) {
        Archify.finder.close({ restoreFocus: false })
      }
      mode = 'idle'
      startId = null
      endId = null
      activeNodeIds = []
      activeEdges = []
      cleanSvgState()
      panel.hidden = true
      panel.setAttribute('data-state', 'idle')
      panel.removeAttribute('data-finder-open')
      title.textContent = viewerText('viewer.route.start')
      renderPlaceholder(viewerText('viewer.route.pickTwo'))
      status.textContent = viewerText('viewer.route.instructions')
      findBtn.hidden = true
      findBtn.textContent = viewerText('viewer.route.start.find')
      findBtn.setAttribute('aria-label', viewerText('viewer.route.start.find.aria'))
      copyBtn.hidden = true
      copyBtn.textContent = viewerText('viewer.route.copy')
      setTrigger(false)
      if (wasActive && options.preserveView !== true && Archify.view && typeof Archify.view.reset === 'function') {
        Archify.view.reset({ automatic: true })
      }
      if (options.updateUrl !== false) replaceRouteHash('')
      if (options.restoreFocus === true) trigger.focus()
    }
    function outgoingByNode() {
      const byId = nodesById()
      const outgoing = {}
      edges().forEach(function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        if (!byId[from] || !byId[to] || from === to) return
        if (!outgoing[from]) outgoing[from] = []
        outgoing[from].push({ edge, to })
      })
      return outgoing
    }
    function reachableFrom(source) {
      const outgoing = outgoingByNode()
      const reached = {}
      const queue = [source]
      reached[source] = true
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const links = outgoing[queue[cursor]] || []
        links.forEach(function (link) {
          if (reached[link.to]) return
          reached[link.to] = true
          queue.push(link.to)
        })
      }
      return reached
    }
    function hopDistancesFrom(source) {
      const outgoing = outgoingByNode()
      const distances = {}
      const queue = [source]
      distances[source] = 0
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const links = outgoing[queue[cursor]] || []
        links.forEach(function (link) {
          if (Object.prototype.hasOwnProperty.call(distances, link.to)) return
          distances[link.to] = distances[queue[cursor]] + 1
          queue.push(link.to)
        })
      }
      return distances
    }
    function shortestDirectedPath(source, target) {
      if (source === target) return null
      const outgoing = outgoingByNode()
      const previous = {}
      const queue = [source]
      previous[source] = null
      for (
        let cursor = 0;
        cursor < queue.length && !Object.prototype.hasOwnProperty.call(previous, target);
        cursor += 1
      ) {
        const links = outgoing[queue[cursor]] || []
        links.some(function (link) {
          if (Object.prototype.hasOwnProperty.call(previous, link.to)) return false
          previous[link.to] = { edge: link.edge, from: queue[cursor] }
          queue.push(link.to)
          return link.to === target
        })
      }
      if (!Object.prototype.hasOwnProperty.call(previous, target)) return null
      const nodeIds = [target]
      const routeEdges = []
      let current = target
      while (current !== source) {
        const step = previous[current]
        if (!step) return null
        routeEdges.unshift(step.edge)
        nodeIds.unshift(step.from)
        current = step.from
      }
      return { edges: routeEdges, nodes: nodeIds }
    }
    function traceGeometry(shape, step) {
      const clone = shape.cloneNode(false)
      clone.removeAttribute('id')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.removeAttribute('marker-start')
      clone.removeAttribute('marker-mid')
      clone.removeAttribute('marker-end')
      clone.removeAttribute('role')
      clone.removeAttribute('aria-label')
      clone.removeAttribute('aria-labelledby')
      clone.removeAttribute('data-animate')
      clone.removeAttribute('data-edge-from')
      clone.removeAttribute('data-edge-to')
      clone.removeAttribute('data-edge-key')
      clone.removeAttribute('data-edge-id')
      clone.removeAttribute('data-edge-label')
      clone.removeAttribute('data-route-match')
      clone.removeAttribute('data-route-step')
      clone.setAttribute('class', 'route-probe-flow')
      clone.setAttribute('pathLength', '1')
      clone.style.setProperty('--route-step', String(step))
      return clone
    }
    function renderOverlay(routeEdges) {
      removeOverlay()
      if (!routeEdges.length) return
      const overlay = document.createElementNS(namespace, 'g')
      overlay.setAttribute('class', 'route-probe-overlay')
      overlay.setAttribute('data-route-probe-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      routeEdges.forEach(function (edge, step) {
        const wrapper = document.createElementNS(namespace, 'g')
        if (edge.hasAttribute('transform')) wrapper.setAttribute('transform', edge.getAttribute('transform'))
        edgeShapes(edge).forEach(function (shape) {
          wrapper.appendChild(traceGeometry(shape, step))
        })
        if (wrapper.childNodes.length) overlay.appendChild(wrapper)
      })
      const firstNode = svg.querySelector('[data-node-id]')
      if (firstNode) svg.insertBefore(overlay, firstNode)
      else svg.appendChild(overlay)
    }
    function journeyButtons() {
      return Array.prototype.slice.call(path.querySelectorAll('[data-route-journey-index]'))
    }
    function journeyMotionAllowed() {
      return (
        html.getAttribute('data-embed') !== 'true' &&
        !document.hidden &&
        Archify.motionGovernor &&
        Archify.motionGovernor.capable === true &&
        !Archify.motionGovernor.isPaused()
      )
    }
    function routeOverviewStatus() {
      return viewerText('viewer.route.overview.status', {
        hops: viewerCount('viewer.route.overview.hop', activeEdges.length),
        nodes: viewerCount('viewer.route.overview.node', activeNodeIds.length),
      })
    }
    function centerJourneyButton(button) {
      if (!button) return
      const target = button.offsetLeft - Math.max(0, (path.clientWidth - button.offsetWidth) / 2)
      path.scrollLeft = Math.max(0, target)
    }
    function focusJourneyButton(index) {
      const buttons = journeyButtons()
      if (!buttons.length) return false
      const next = Math.max(0, Math.min(buttons.length - 1, index))
      buttons.forEach(function (button, buttonIndex) {
        button.setAttribute('tabindex', buttonIndex === next ? '0' : '-1')
      })
      try {
        buttons[next].focus({ preventScroll: true })
      } catch (_) {
        reportArchifyFailure(_)
        buttons[next].focus()
      }
      centerJourneyButton(buttons[next])
      return true
    }
    function renderJourneyControls() {
      const hasRoute = mode === 'result' && activeNodeIds.length > 1
      const canPlay = hasRoute && journeyMotionAllowed()
      journeyControls.hidden = !hasRoute
      journeyControls.setAttribute('data-playing', journeyPlaying ? 'true' : 'false')
      journeyPrevBtn.disabled = !hasRoute || journeyIndex <= 0
      journeyNextBtn.disabled = !hasRoute || journeyIndex >= activeNodeIds.length - 1
      journeyOverviewBtn.disabled = !hasRoute || journeyIndex < 0
      journeyPlayBtn.disabled = !canPlay
      journeyPlayBtn.setAttribute('aria-pressed', journeyPlaying ? 'true' : 'false')
      if (journeyPlaying) {
        journeyPlayIcon.textContent = '\u275A\u275A'
        journeyPlayLabel.textContent = viewerText('viewer.route.pause.label')
        journeyPlayBtn.setAttribute('aria-label', viewerText('viewer.route.pause'))
        journeyPlayBtn.title = viewerText('viewer.route.pause')
      } else if (journeyComplete || journeyIndex === activeNodeIds.length - 1) {
        journeyPlayIcon.textContent = '\u21BB'
        journeyPlayLabel.textContent = viewerText('viewer.route.replay.label')
        journeyPlayBtn.setAttribute('aria-label', viewerText('viewer.route.replay'))
        journeyPlayBtn.title = viewerText(canPlay ? 'viewer.route.replay' : 'viewer.route.motionRequired')
      } else {
        journeyPlayIcon.textContent = '\u25B6'
        journeyPlayLabel.textContent = viewerText('viewer.route.journey')
        journeyPlayBtn.setAttribute('aria-label', viewerText('viewer.route.play'))
        journeyPlayBtn.title = viewerText(canPlay ? 'viewer.route.play' : 'viewer.route.motionRequired')
      }
    }
    function journeyGeometry(shape) {
      const clone = shape.cloneNode(false)
      clone.removeAttribute('id')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.removeAttribute('marker-start')
      clone.removeAttribute('marker-mid')
      clone.removeAttribute('marker-end')
      clone.removeAttribute('role')
      clone.removeAttribute('aria-label')
      clone.removeAttribute('aria-labelledby')
      clone.removeAttribute('data-animate')
      clone.removeAttribute('data-edge-from')
      clone.removeAttribute('data-edge-to')
      clone.removeAttribute('data-edge-key')
      clone.removeAttribute('data-edge-id')
      clone.removeAttribute('data-edge-label')
      clone.removeAttribute('data-route-match')
      clone.removeAttribute('data-route-step')
      clone.removeAttribute('data-route-journey-state')
      clone.removeAttribute('data-route-journey-current')
      clone.setAttribute('class', 'route-journey-flow')
      clone.setAttribute('pathLength', '1')
      return clone
    }
    function renderJourneyPulse(edge) {
      removeJourneyPulse()
      if (!edge || !journeyMotionAllowed()) return false
      const overlay = document.createElementNS(namespace, 'g')
      overlay.setAttribute('class', 'route-journey-overlay')
      overlay.setAttribute('data-route-journey-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      const wrapper = document.createElementNS(namespace, 'g')
      if (edge.hasAttribute('transform')) wrapper.setAttribute('transform', edge.getAttribute('transform'))
      edgeShapes(edge).forEach(function (shape) {
        wrapper.appendChild(journeyGeometry(shape))
      })
      if (!wrapper.childNodes.length) return false
      overlay.appendChild(wrapper)
      const firstNode = svg.querySelector('[data-node-id]')
      if (firstNode) svg.insertBefore(overlay, firstNode)
      else svg.appendChild(overlay)
      if (Archify.motionGovernor && Archify.motionGovernor.capable) {
        let token = 0
        token = Archify.motionGovernor.claim('route', function () {
          if (journeyOwnerToken === token) journeyOwnerToken = 0
          removeJourneyPulse({ release: false })
        })
        journeyOwnerToken = token
      }
      overlay.addEventListener(
        'animationend',
        function () {
          if (overlay.isConnected) removeJourneyPulse()
        },
        { once: true },
      )
      browser.setTimeout(function () {
        if (overlay.isConnected) removeJourneyPulse()
      }, 860)
      return true
    }
    function applyJourneyState(index, options) {
      options = options || {}
      if (mode !== 'result' || !activeNodeIds.length) return false
      const byId = nodesById()
      journeyIndex = Math.max(0, Math.min(activeNodeIds.length - 1, index))
      removeJourneyPulse()
      svg.setAttribute('data-route-journey', journeyIndex + 1 + '/' + activeNodeIds.length)
      panel.setAttribute('data-route-journey', String(journeyIndex))
      activeNodeIds.forEach(function (id, step) {
        const node = byId[id]
        if (!node) return
        const state = step < journeyIndex ? 'past' : step === journeyIndex ? 'current' : 'future'
        node.setAttribute('data-route-journey-state', state)
        if (step === journeyIndex) node.setAttribute('data-route-journey-current', '')
        else node.removeAttribute('data-route-journey-current')
      })
      activeEdges.forEach(function (edge, step) {
        const destination = step + 1
        const state = destination < journeyIndex ? 'past' : destination === journeyIndex ? 'current' : 'future'
        edge.setAttribute('data-route-journey-state', state)
        if (destination === journeyIndex) edge.setAttribute('data-route-journey-current', '')
        else edge.removeAttribute('data-route-journey-current')
      })
      const buttons = journeyButtons()
      buttons.forEach(function (button, step) {
        const state = step < journeyIndex ? 'past' : step === journeyIndex ? 'current' : 'future'
        button.setAttribute('data-route-journey-state', state)
        button.setAttribute('tabindex', step === journeyIndex ? '0' : '-1')
        if (step === journeyIndex) button.setAttribute('aria-current', 'step')
        else button.removeAttribute('aria-current')
      })
      if (options.center !== false) centerJourneyButton(buttons[journeyIndex])
      const phase = viewerText(
        journeyPlaying
          ? 'viewer.route.phase.playing'
          : journeyComplete
            ? 'viewer.route.phase.complete'
            : 'viewer.route.phase.inspecting',
      )
      status.textContent = viewerText('viewer.route.step', {
        index: journeyIndex + 1,
        label: nodeLabel(byId[activeNodeIds[journeyIndex]], activeNodeIds[journeyIndex]),
        phase,
        total: activeNodeIds.length,
      })
      if (options.pulse === true && journeyIndex > 0) renderJourneyPulse(activeEdges[journeyIndex - 1])
      if (options.reveal !== false && Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal(
          activeNodeIds.slice(Math.max(0, journeyIndex - 1), Math.min(activeNodeIds.length, journeyIndex + 2)),
          {
            duration: 360,
            includeNeighbors: false,
            instant: !journeyMotionAllowed(),
            maxScale: 1.65,
            padding: 64,
            reason: 'route-journey',
          },
        )
      }
      renderJourneyControls()
      requestDocking()
      return true
    }
    function pauseJourney(options) {
      options = options || {}
      if (!journeyPlaying && options.complete !== true) {
        renderJourneyControls()
        return false
      }
      stopJourneyTimer({ preserveElapsed: options.complete !== true && options.preserveElapsed !== false })
      journeyPlaying = false
      journeyComplete = options.complete === true
      if (journeyComplete) journeyElapsedMs = 0
      removeJourneyPulse()
      if (journeyIndex >= 0) applyJourneyState(journeyIndex, { center: false, pulse: false, reveal: false })
      else renderJourneyControls()
      return true
    }
    function selectJourneyIndex(index) {
      if (mode !== 'result') return false
      stopJourneyTimer()
      journeyPlaying = false
      journeyComplete = false
      return applyJourneyState(index, { pulse: true, reveal: true })
    }
    function showJourneyOverview(options) {
      options = options || {}
      if (mode !== 'result') return false
      stopJourneyTimer()
      journeyPlaying = false
      journeyComplete = false
      journeyIndex = -1
      clearJourneyPresentation({ keepControls: true })
      status.textContent = routeOverviewStatus()
      renderJourneyControls()
      if (options.reveal !== false && Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal(activeNodeIds, {
          includeNeighbors: false,
          instant: !journeyMotionAllowed(),
          reason: 'route',
        })
      }
      requestDocking()
      return true
    }
    function scheduleJourney() {
      if (!journeyPlaying || !journeyMotionAllowed()) {
        pauseJourney({ preserveElapsed: true })
        return false
      }
      const generation = ++journeyGeneration
      const remaining = Math.max(0, JOURNEY_DWELL_MS - journeyElapsedMs)
      journeyStartedAt = Date.now()
      journeyTimer = browser.setTimeout(function () {
        if (generation !== journeyGeneration || !journeyPlaying) return
        journeyTimer = null
        journeyStartedAt = 0
        journeyElapsedMs = 0
        if (journeyIndex >= activeNodeIds.length - 1) {
          pauseJourney({ complete: true, preserveElapsed: false })
          return
        }
        applyJourneyState(journeyIndex + 1, { pulse: true, reveal: true })
        journeyElapsedMs = 0
        journeyStartedAt = 0
        scheduleJourney()
      }, remaining)
      return true
    }
    function playJourney() {
      if (mode !== 'result' || activeNodeIds.length < 2 || !journeyMotionAllowed()) {
        renderJourneyControls()
        return false
      }
      if (journeyPlaying) return true
      if (journeyComplete || journeyIndex >= activeNodeIds.length - 1) {
        journeyIndex = -1
        journeyElapsedMs = 0
        journeyComplete = false
      }
      journeyPlaying = true
      if (journeyIndex < 0) applyJourneyState(0, { pulse: false, reveal: true })
      else applyJourneyState(journeyIndex, { center: false, pulse: false, reveal: false })
      scheduleJourney()
      return true
    }
    function toggleJourney() {
      return journeyPlaying ? pauseJourney({ preserveElapsed: true }) : playJourney()
    }
    function previousJourney() {
      return selectJourneyIndex(Math.max(0, journeyIndex < 0 ? 0 : journeyIndex - 1))
    }
    function nextJourney() {
      return selectJourneyIndex(Math.min(activeNodeIds.length - 1, journeyIndex + 1))
    }
    function overlapArea(a, b) {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      return width * height
    }
    function updateDocking() {
      if (panel.hidden) {
        panel.removeAttribute('data-route-dock')
        return
      }
      const containerRect = container.getBoundingClientRect()
      const width = panel.offsetWidth
      const height = panel.offsetHeight
      if (!width || !height) return
      const currentRect = panel.getBoundingClientRect()
      const left = currentRect.left
      const topCandidate = {
        bottom: containerRect.top + 8 + height,
        left,
        right: left + width,
        top: containerRect.top + 8,
      }
      const nav = container.querySelector('.diagram-nav')
      const navRect = nav ? nav.getBoundingClientRect() : null
      const bottom = navRect ? navRect.top - 9 : containerRect.bottom - 8
      const bottomCandidate = {
        bottom,
        left,
        right: left + width,
        top: bottom - height,
      }
      const byId = nodesById()
      const relevant = activeNodeIds.length ? activeNodeIds : startId ? [startId] : []
      const blockers = relevant
        .map(function (id) {
          return byId[id]
        })
        .filter(Boolean)
        .map(function (node) {
          return node.getBoundingClientRect()
        })
      function score(candidate) {
        let value = blockers.reduce(function (sum, rect) {
          return sum + overlapArea(candidate, rect)
        }, 0)
        if (navRect) value += overlapArea(candidate, navRect) * 4
        if (candidate.top < containerRect.top || candidate.bottom > containerRect.bottom) value += 1e6
        return value
      }
      if (score(topCandidate) <= score(bottomCandidate)) panel.setAttribute('data-route-dock', 'top')
      else panel.setAttribute('data-route-dock', 'bottom')
    }
    function requestDocking() {
      requestAnimationFrame(updateDocking)
      browser.setTimeout(updateDocking, 120)
      browser.setTimeout(updateDocking, 560)
    }
    function chooseStart(id) {
      const byId = nodesById()
      if (!byId[id]) return false
      cleanSvgState()
      startId = id
      endId = null
      mode = 'target'
      const reached = reachableFrom(id)
      byId[id].setAttribute('data-route-start', '')
      byId[id].setAttribute('data-route-match', '')
      Object.keys(reached).forEach(function (candidateId) {
        if (candidateId !== id && byId[candidateId]) byId[candidateId].setAttribute('data-route-candidate', '')
      })
      svg.setAttribute('data-route-picking', 'target')
      panel.setAttribute('data-state', 'target')
      title.textContent = viewerText('viewer.route.destination', { label: nodeLabel(byId[id], id) })
      renderPath([id])
      const count = Math.max(0, Object.keys(reached).length - 1)
      status.textContent = count
        ? viewerCount('viewer.route.destination.count', count)
        : viewerText('viewer.route.noOutgoing')
      findBtn.hidden = false
      findBtn.textContent = viewerText('viewer.route.destination.find')
      findBtn.setAttribute('aria-label', viewerText('viewer.route.destination.find.aria'))
      requestDocking()
      return true
    }
    function showResult(result, options) {
      options = options || {}
      const byId = nodesById()
      cleanSvgState()
      mode = 'result'
      startId = result.nodes[0]
      endId = result.nodes[result.nodes.length - 1]
      activeNodeIds = result.nodes.slice()
      activeEdges = result.edges.slice()
      result.nodes.forEach(function (id, step) {
        const node = byId[id]
        if (!node) return
        node.setAttribute('data-route-match', '')
        node.setAttribute('data-route-step', String(step))
        node.style.setProperty('--route-step', String(step))
        if (step === 0) node.setAttribute('data-route-start', '')
        if (step === result.nodes.length - 1) node.setAttribute('data-route-end', '')
      })
      result.edges.forEach(function (edge, step) {
        edge.setAttribute('data-route-match', '')
        edge.setAttribute('data-route-step', String(step))
        edge.style.setProperty('--route-step', String(step))
      })
      svg.setAttribute('data-route-active', startId + '~' + endId)
      renderOverlay(result.edges)
      renderPath(result.nodes, { interactive: true })
      panel.setAttribute('data-state', 'result')
      panel.hidden = false
      title.textContent = viewerText('viewer.route.result.title', {
        source: nodeLabel(byId[startId], startId),
        target: nodeLabel(byId[endId], endId),
      })
      findBtn.hidden = true
      copyBtn.hidden = false
      setTrigger(true)
      if (options.updateUrl !== false) {
        replaceRouteHash(encodeURIComponent(startId) + '~' + encodeURIComponent(endId))
      }
      showJourneyOverview({ reveal: false })
      if (Archify.view && typeof Archify.view.reveal === 'function') {
        Archify.view.reveal(result.nodes, { includeNeighbors: false, reason: 'route' })
      }
      return true
    }
    function choose(id, options) {
      options = options || {}
      const byId = nodesById()
      if (!byId[id]) return false
      if (mode === 'source') return chooseStart(id)
      if (mode !== 'target') return false
      if (id === startId) {
        panel.setAttribute('data-state', 'error')
        title.textContent = viewerText('viewer.route.differentDestination')
        status.textContent = viewerText('viewer.route.distinct')
        return false
      }
      const result = shortestDirectedPath(startId, id)
      if (!result) {
        panel.setAttribute('data-state', 'error')
        title.textContent = viewerText('viewer.route.unreachable', { label: nodeLabel(byId[id], id) })
        status.textContent = viewerText('viewer.route.unreachable.detail', {
          source: nodeLabel(byId[startId], startId),
          target: nodeLabel(byId[id], id),
        })
        return false
      }
      return showResult(result, options)
    }
    function begin(options) {
      options = options || {}
      if (html.getAttribute('data-embed') === 'true') return false
      if (Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
        Archify.semanticLens.clearPreview()
      if (Archify.semanticLens && Archify.semanticLens.active()) {
        Archify.semanticLens.clear({ closePanel: true, preserveView: true, updateUrl: false })
      }
      let focused =
        options.source || (Archify.focus && typeof Archify.focus.active === 'function' ? Archify.focus.active() : null)
      if (Array.isArray(focused)) focused = null
      clear({ preserveView: true, restoreFocus: false, updateUrl: false })
      if (Archify.intentTrace && typeof Archify.intentTrace.clear === 'function')
        Archify.intentTrace.clear({ announce: false })
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, updateUrl: false })
      }
      if (Archify.focus && typeof Archify.focus.clear === 'function') {
        Archify.focus.clear({ preserveView: true, updateUrl: false })
      }
      if (Archify.finder && Archify.finder.isOpen()) Archify.finder.close({ restoreFocus: false })
      if (Archify.radar && Archify.radar.isOpen()) Archify.radar.close({ restoreFocus: false })
      mode = 'source'
      panel.hidden = false
      panel.setAttribute('data-state', 'source')
      svg.setAttribute('data-route-picking', 'source')
      title.textContent = viewerText('viewer.route.start')
      renderPlaceholder(viewerText('viewer.route.pickOne'))
      status.textContent = viewerText('viewer.route.start.instructions')
      findBtn.hidden = false
      findBtn.textContent = viewerText('viewer.route.start.find')
      findBtn.setAttribute('aria-label', viewerText('viewer.route.start.find.aria'))
      copyBtn.hidden = true
      setTrigger(true)
      if (focused && nodesById()[focused]) chooseStart(focused)
      if (options.focusNode === true && !focused) {
        const first = nodes()[0]
        if (first) {
          try {
            first.focus({ preventScroll: true })
          } catch (_) {
            reportArchifyFailure(_)
            try {
              first.focus()
            } catch (_2) {
              reportArchifyFailure(_2)
            }
          }
        }
      }
      return true
    }
    function toggle(options) {
      if (mode !== 'idle') {
        clear({ restoreFocus: true })
        return false
      }
      return begin(options)
    }
    function finderContext() {
      const byId = nodesById()
      if (mode === 'source') {
        const outgoing = outgoingByNode()
        const sourceIds = nodes()
          .map(function (node) {
            return node.getAttribute('data-node-id')
          })
          .filter(function (id) {
            return outgoing[id] && outgoing[id].length
          })
        const sourceBadges = {}
        sourceIds.forEach(function (id) {
          sourceBadges[id] = viewerText('viewer.route.finder.source.badge')
        })
        return {
          allowedIds: sourceIds,
          availableNoun: viewerText('viewer.route.finder.source.noun'),
          badges: sourceBadges,
          empty: viewerText('viewer.route.finder.source.empty'),
          kind: 'route-source',
          placeholder: viewerText('viewer.route.finder.source.placeholder'),
          resultsLabel: viewerText('viewer.route.finder.source.results'),
          title: viewerText('viewer.route.finder.source.title'),
        }
      }
      if (mode === 'target' && startId && byId[startId]) {
        const distances = hopDistancesFrom(startId)
        const targetIds = Object.keys(distances).filter(function (id) {
          return id !== startId && byId[id]
        })
        const targetBadges = {}
        targetIds.forEach(function (id) {
          targetBadges[id] = viewerCount('viewer.route.hop', distances[id])
        })
        return {
          allowedIds: targetIds,
          availableNoun: viewerText('viewer.route.finder.target.noun'),
          badges: targetBadges,
          empty: viewerText('viewer.route.finder.target.empty'),
          kind: 'route-target',
          placeholder: viewerText('viewer.route.finder.target.placeholder'),
          resultsLabel: viewerText('viewer.route.finder.target.results'),
          title: viewerText('viewer.route.finder.target.title', { label: nodeLabel(byId[startId], startId) }),
        }
      }
      return null
    }
    function finderOpening() {
      panel.setAttribute('data-finder-open', 'true')
    }
    function finderClosed(options) {
      options = options || {}
      panel.removeAttribute('data-finder-open')
      requestDocking()
      if (options.restoreFocus === true && !findBtn.hidden) findBtn.focus()
    }
    function openFinder() {
      const context = finderContext()
      if (!context || !Archify.finder) return false
      return Archify.finder.open({ context })
    }
    function fallbackCopy(value) {
      const field = document.createElement('textarea')
      field.value = value
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch (_) {
        reportArchifyFailure(_)
      }
      field.remove()
      return copied
    }
    function copyLink() {
      if (mode !== 'result') return Promise.resolve(false)
      const value =
        location.href.replace(/#.*$/, '') + '#route=' + encodeURIComponent(startId) + '~' + encodeURIComponent(endId)
      const copy =
        browserNavigator.clipboard && typeof browserNavigator.clipboard.writeText === 'function'
          ? browserNavigator.clipboard
              .writeText(value)
              .then(function () {
                return true
              })
              .catch(function (error) {
                reportArchifyFailure(error)
                return fallbackCopy(value)
              })
          : Promise.resolve(fallbackCopy(value))
      return copy.then(function (copied) {
        copyBtn.textContent = viewerText(copied ? 'viewer.common.copied' : 'viewer.common.copyFailed')
        copyBtn.setAttribute(
          'aria-label',
          viewerText(copied ? 'viewer.route.copy.success' : 'viewer.route.copy.failed'),
        )
        browser.setTimeout(function () {
          copyBtn.textContent = viewerText('viewer.route.copy')
          copyBtn.setAttribute('aria-label', viewerText('viewer.route.copy.aria'))
        }, 1600)
        return copied
      })
    }
    function interceptSelection(event) {
      if (mode !== 'source' && mode !== 'target') return
      if (container.getAttribute('data-just-panned') === 'true') return
      const node = event.target.closest('[data-node-id]')
      if (!node) return
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      event.stopImmediatePropagation()
      choose(node.getAttribute('data-node-id'))
    }
    function syncFromHash() {
      try {
        const params = new URLSearchParams(location.hash.replace(/^#/, ''))
        const route = params.get('route')
        if (!route) {
          if (mode !== 'idle') clear({ restoreFocus: false, updateUrl: false })
          return
        }
        const parts = route.split('~')
        if (parts.length !== 2) return
        const byId = nodesById()
        if (!byId[parts[0]] || !byId[parts[1]]) return
        begin({ focusNode: false, source: parts[0] })
        choose(parts[1], { updateUrl: false })
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function escapeRoute(options) {
      options = options || {}
      if (journeyPlaying) {
        pauseJourney({ preserveElapsed: true })
        if (options.restoreFocus === true) journeyPlayBtn.focus()
        return 'paused'
      }
      if (journeyIndex >= 0) {
        showJourneyOverview({ reveal: true })
        if (options.restoreFocus === true) journeyOverviewBtn.focus()
        return 'overview'
      }
      clear({ restoreFocus: options.restoreFocus === true })
      return 'cleared'
    }
    function syncJourneyMotion() {
      if (journeyPlaying && !journeyMotionAllowed()) pauseJourney({ preserveElapsed: true })
      renderJourneyControls()
      return journeyMotionAllowed()
    }
    trigger.addEventListener('click', function () {
      toggle({ focusNode: false })
    })
    findBtn.addEventListener('click', openFinder)
    clearBtn.addEventListener('click', function () {
      clear({ restoreFocus: true })
    })
    copyBtn.addEventListener('click', copyLink)
    journeyPrevBtn.addEventListener('click', previousJourney)
    journeyPlayBtn.addEventListener('click', toggleJourney)
    journeyNextBtn.addEventListener('click', nextJourney)
    journeyOverviewBtn.addEventListener('click', function () {
      showJourneyOverview({ reveal: true })
    })
    path.addEventListener('click', function (event) {
      const button = event.target.closest('[data-route-journey-index]')
      if (!button) return
      selectJourneyIndex(Number(button.getAttribute('data-route-journey-index')))
    })
    path.addEventListener('focusin', function (event) {
      if (journeyPlaying && event.target.closest('[data-route-journey-index]')) pauseJourney({ preserveElapsed: true })
    })
    path.addEventListener('keydown', function (event) {
      const button = event.target.closest('[data-route-journey-index]')
      if (!button) return
      const index = Number(button.getAttribute('data-route-journey-index'))
      let next = null
      if (event.key === 'ArrowRight') next = Math.min(activeNodeIds.length - 1, index + 1)
      else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1)
      else if (event.key === 'Home') next = 0
      else if (event.key === 'End') next = activeNodeIds.length - 1
      if (next !== null) {
        event.preventDefault()
        focusJourneyButton(next)
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectJourneyIndex(index)
      }
    })
    svg.addEventListener('click', interceptSelection, true)
    svg.addEventListener('keydown', interceptSelection, true)
    container.addEventListener('scroll', updateDocking, { passive: true })
    browser.addEventListener('resize', requestDocking)
    browser.addEventListener('beforeprint', function () {
      if (journeyPlaying) pauseJourney({ preserveElapsed: true, reason: 'print' })
      else removeJourneyPulse()
    })
    browser.addEventListener('hashchange', function () {
      requestAnimationFrame(syncFromHash)
    })
    syncFromHash()
    return {
      active: function () {
        return mode === 'idle' ? null : mode
      },
      begin,
      choose,
      clear,
      copyLink,
      escape: escapeRoute,
      exportSnapshot,
      finderClosed,
      finderContext,
      finderOpening,
      isJourneyPlaying: function () {
        return journeyPlaying
      },
      openFinder,
      pauseJourney,
      playJourney,
      result: function () {
        return mode === 'result'
          ? {
              hops: activeEdges.length,
              journey: journeyIndex,
              nodes: activeNodeIds.slice(),
              playing: journeyPlaying,
              source: startId,
              target: endId,
            }
          : null
      },
      selectJourneyIndex,
      showOverview: showJourneyOverview,
      syncMotion: syncJourneyMotion,
      toggle,
    }
  })()
  Archify.semanticLens = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector(':scope > svg')
    const trigger = document.getElementById('btn-semantic-lens')
    const panel = document.getElementById('semantic-lens')
    const closeBtn = document.getElementById('semantic-lens-close')
    const kindsRoot = document.getElementById('semantic-lens-kinds')
    const status = document.getElementById('semantic-lens-status')
    const copyBtn = document.getElementById('semantic-lens-copy')
    const clearBtn = document.getElementById('semantic-lens-clear')
    const legendBridge = svg.querySelector('[data-legend-bridge]')
    let legendEntries = []
    let hoveredLegendEntry = null
    let focusedLegendEntry = null
    let activeLegendPreview = null
    let lensOpener = trigger
    let selectedKinds = []
    const namespace = 'http://www.w3.org/2000/svg'
    const finePointerQuery = browser.matchMedia ? browser.matchMedia('(hover: hover) and (pointer: fine)') : null
    const MAX_LENS_FLOW_EDGES = 24
    function nodesById() {
      const byId = {}
      Array.prototype.forEach.call(svg.querySelectorAll('[data-node-id][data-node-kind]'), function (node) {
        const id = node.getAttribute('data-node-id')
        if (id && !byId[id]) byId[id] = node
      })
      return byId
    }
    function collectKinds() {
      const kinds = {}
      const byId = nodesById()
      Object.keys(byId).forEach(function (id) {
        const node = byId[id]
        const value = node.getAttribute('data-node-kind') || 'neutral'
        const kind = kinds[value] || (kinds[value] = { id: value, label: viewerKindLabel(value), nodes: [] })
        kind.nodes.push(node)
      })
      return Object.keys(kinds)
        .map(function (key) {
          return kinds[key]
        })
        .sort(function (a, b) {
          return b.nodes.length - a.nodes.length || a.label.localeCompare(b.label)
        })
    }
    function edgeGroups() {
      const groups = {}
      Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'), function (edge) {
        const from = edge.getAttribute('data-edge-from')
        const to = edge.getAttribute('data-edge-to')
        const key =
          edge.getAttribute('data-edge-key') || [from, to, edge.getAttribute('data-edge-label') || ''].join('\0')
        if (!groups[key]) groups[key] = { from, key, members: [], to }
        groups[key].members.push(edge)
      })
      return Object.keys(groups).map(function (key) {
        return groups[key]
      })
    }
    function edgeShapes(edge) {
      if (!edge) return []
      if (/^(path|line|polyline)$/i.test(edge.tagName || '')) return [edge]
      return Array.prototype.slice.call(edge.querySelectorAll('path, line, polyline'))
    }
    function legendSourceBounds(entry) {
      let bounds = null
      Array.prototype.forEach.call(entry.children, function (child) {
        if (child.hasAttribute('data-legend-bridge-runtime')) return
        let box
        try {
          box = child.getBBox()
        } catch (_) {
          reportArchifyFailure(_)
          return
        }
        if (!box || !Number.isFinite(box.x) || !Number.isFinite(box.y)) return
        const next = { bottom: box.y + box.height, left: box.x, right: box.x + box.width, top: box.y }
        if (!bounds) bounds = next
        else {
          bounds.left = Math.min(bounds.left, next.left)
          bounds.top = Math.min(bounds.top, next.top)
          bounds.right = Math.max(bounds.right, next.right)
          bounds.bottom = Math.max(bounds.bottom, next.bottom)
        }
      })
      return bounds
    }
    function layoutLegendEntry(entry) {
      const bounds = legendSourceBounds(entry)
      const hit = entry.querySelector('[data-legend-hit]')
      const badge = entry.querySelector('[data-legend-count-badge]')
      if (!bounds || !hit || !badge) return false
      const count = entry.getAttribute('data-legend-count') || '0'
      const centerY = (bounds.top + bounds.bottom) / 2
      const badgeWidth = Math.max(14, count.length * 5 + 8)
      const badgeX = bounds.right + 3
      const hitX = bounds.left - 5
      const hitRight = badgeX + badgeWidth + 4
      hit.setAttribute('x', hitX.toFixed(2))
      hit.setAttribute('y', (centerY - 12).toFixed(2))
      hit.setAttribute('width', Math.max(24, hitRight - hitX).toFixed(2))
      hit.setAttribute('height', '24')
      hit.setAttribute('rx', '4')
      const badgeRect = badge.querySelector('rect')
      const badgeText = badge.querySelector('text')
      badgeRect.setAttribute('x', badgeX.toFixed(2))
      badgeRect.setAttribute('y', (centerY - 7).toFixed(2))
      badgeRect.setAttribute('width', badgeWidth.toFixed(2))
      badgeRect.setAttribute('height', '14')
      badgeRect.setAttribute('rx', '7')
      badgeText.setAttribute('x', (badgeX + badgeWidth / 2).toFixed(2))
      badgeText.setAttribute('y', (centerY + 2.5).toFixed(2))
      return true
    }
    function layoutLegendBridge() {
      legendEntries.forEach(layoutLegendEntry)
      if (!legendBridge) return
      Array.prototype.forEach.call(legendBridge.querySelectorAll('[data-legend-zero]'), layoutLegendEntry)
    }
    function decorateLegendBridge() {
      legendEntries = []
      if (!legendBridge || html.getAttribute('data-embed') === 'true') return false
      const facts = {}
      collectKinds().forEach(function (kind) {
        facts[kind.id] = kind
      })
      Array.prototype.forEach.call(legendBridge.querySelectorAll('[data-legend-kind]'), function (entry) {
        const kind = entry.getAttribute('data-legend-kind')
        const fact = facts[kind]
        const count = fact ? fact.nodes.length : 0
        entry.setAttribute('data-legend-count', String(count))
        const hit = document.createElementNS(namespace, 'rect')
        hit.setAttribute('data-legend-bridge-runtime', '')
        hit.setAttribute('data-legend-hit', '')
        hit.setAttribute('aria-hidden', 'true')
        entry.insertBefore(hit, entry.firstChild)
        const badge = document.createElementNS(namespace, 'g')
        badge.setAttribute('data-legend-bridge-runtime', '')
        badge.setAttribute('data-legend-count-badge', '')
        badge.setAttribute('aria-hidden', 'true')
        badge.appendChild(document.createElementNS(namespace, 'rect'))
        const countText = document.createElementNS(namespace, 'text')
        countText.textContent = String(count)
        badge.appendChild(countText)
        entry.appendChild(badge)
        if (!fact || !count) {
          entry.setAttribute('data-legend-zero', '')
          return
        }
        entry.setAttribute('role', 'button')
        entry.setAttribute('tabindex', legendEntries.length ? '-1' : '0')
        const visibleLabel = entry.getAttribute('data-legend-label') || fact.label
        entry.setAttribute('aria-label', viewerCount('viewer.lens.legend.inspect', count, { label: visibleLabel }))
        entry.setAttribute('aria-pressed', 'false')
        entry.setAttribute('aria-haspopup', 'dialog')
        entry.setAttribute('aria-controls', 'semantic-lens')
        entry.setAttribute('aria-expanded', 'false')
        legendEntries.push(entry)
      })
      if (!legendEntries.length) return false
      legendBridge.setAttribute('role', legendEntries.length >= 3 ? 'toolbar' : 'group')
      legendBridge.setAttribute('aria-label', viewerText('viewer.lens.legend'))
      syncLegendBridge()
      layoutLegendBridge()
      try {
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutLegendBridge)
      } catch (_) {
        reportArchifyFailure(_)
      }
      return true
    }
    function syncLegendBridge() {
      legendEntries.forEach(function (entry) {
        const selected = selectedKinds.indexOf(entry.getAttribute('data-legend-kind')) >= 0
        entry.setAttribute('aria-pressed', selected ? 'true' : 'false')
        entry.setAttribute('aria-expanded', !panel.hidden && lensOpener === entry ? 'true' : 'false')
        if (selected) entry.setAttribute('data-legend-selected', '')
        else entry.removeAttribute('data-legend-selected')
      })
    }
    function clearLegendPreview() {
      activeLegendPreview = null
      svg.removeAttribute('data-legend-preview-active')
      Array.prototype.forEach.call(
        svg.querySelectorAll('[data-legend-preview-match], [data-legend-preview-selected], [data-legend-preview-peer]'),
        function (element) {
          element.removeAttribute('data-legend-preview-match')
          element.removeAttribute('data-legend-preview-selected')
          element.removeAttribute('data-legend-preview-peer')
        },
      )
    }
    function strongerLegendOwnerActive() {
      return (
        selectedKinds.length > 0 ||
        !panel.hidden ||
        html.getAttribute('data-present') === 'true' ||
        svg.hasAttribute('data-focus-active') ||
        svg.hasAttribute('data-intent-trace-active') ||
        svg.hasAttribute('data-route-picking') ||
        svg.hasAttribute('data-route-active') ||
        svg.hasAttribute('data-story-active') ||
        svg.hasAttribute('data-relationship-preview-active')
      )
    }
    function previewLegendKind(entry) {
      clearLegendPreview()
      if (!entry || strongerLegendOwnerActive()) return false
      const kind = entry.getAttribute('data-legend-kind')
      const byId = nodesById()
      const matches = Object.keys(byId).filter(function (id) {
        return (byId[id].getAttribute('data-node-kind') || 'neutral') === kind
      })
      if (!matches.length) return false
      const chosen = {}
      matches.forEach(function (id) {
        chosen[id] = true
        byId[id].setAttribute('data-legend-preview-match', '')
        byId[id].setAttribute('data-legend-preview-selected', '')
      })
      edgeGroups().forEach(function (edge) {
        if (!chosen[edge.from] && !chosen[edge.to]) return
        edge.members.forEach(function (member) {
          member.setAttribute('data-legend-preview-match', '')
        })
        ;[edge.from, edge.to].forEach(function (id) {
          if (!byId[id] || chosen[id]) return
          byId[id].setAttribute('data-legend-preview-match', '')
          byId[id].setAttribute('data-legend-preview-peer', '')
        })
      })
      svg.setAttribute('data-legend-preview-active', kind)
      activeLegendPreview = entry
      return true
    }
    function syncLegendPreview() {
      const next = focusedLegendEntry || hoveredLegendEntry
      if (next === activeLegendPreview) return
      clearLegendPreview()
      if (next) previewLegendKind(next)
    }
    function activateLegendEntry(entry) {
      if (!entry || entry.getAttribute('role') !== 'button') return false
      clearLegendPreview()
      select(entry.getAttribute('data-legend-kind'))
      return open({ opener: entry })
    }
    function removeFlowOverlay() {
      Array.prototype.forEach.call(svg.querySelectorAll('[data-semantic-lens-overlay]'), function (element) {
        element.remove()
      })
      svg.removeAttribute('data-lens-flow-count')
      svg.removeAttribute('data-lens-flow-density')
    }
    function flowGeometry(shape, direction, step) {
      const clone = shape.cloneNode(false)
      clone.removeAttribute('id')
      clone.removeAttribute('class')
      clone.removeAttribute('style')
      clone.removeAttribute('marker-start')
      clone.removeAttribute('marker-mid')
      clone.removeAttribute('marker-end')
      clone.removeAttribute('role')
      clone.removeAttribute('aria-label')
      clone.removeAttribute('aria-hidden')
      clone.removeAttribute('data-animate')
      clone.removeAttribute('data-edge-from')
      clone.removeAttribute('data-edge-to')
      clone.removeAttribute('data-edge-key')
      clone.removeAttribute('data-edge-id')
      clone.removeAttribute('data-edge-label')
      clone.removeAttribute('data-lens-match')
      clone.setAttribute('class', 'semantic-lens-flow')
      clone.setAttribute('data-direction', direction)
      clone.setAttribute('pathLength', '1')
      clone.style.setProperty('--lens-flow-delay', (step * 0.08).toFixed(2) + 's')
      return clone
    }
    function renderFlowOverlay(entries) {
      removeFlowOverlay()
      svg.setAttribute('data-lens-flow-count', String(entries.length))
      if (!entries.length || html.getAttribute('data-embed') === 'true') return false
      if (entries.length > MAX_LENS_FLOW_EDGES) {
        svg.setAttribute('data-lens-flow-density', 'quiet')
        return false
      }
      const overlay = document.createElementNS(namespace, 'g')
      overlay.setAttribute('class', 'semantic-lens-overlay')
      overlay.setAttribute('data-semantic-lens-overlay', '')
      overlay.setAttribute('aria-hidden', 'true')
      entries.forEach(function (entry, step) {
        const wrapper = document.createElementNS(namespace, 'g')
        if (entry.edge.members[0].hasAttribute('transform')) {
          wrapper.setAttribute('transform', entry.edge.members[0].getAttribute('transform'))
        }
        edgeShapes(entry.edge.members[0]).forEach(function (shape) {
          wrapper.appendChild(flowGeometry(shape, entry.direction, step))
        })
        if (wrapper.childNodes.length) overlay.appendChild(wrapper)
      })
      if (!overlay.childNodes.length) return false
      const firstNode = svg.querySelector('[data-node-id]')
      if (firstNode) svg.insertBefore(overlay, firstNode)
      else svg.appendChild(overlay)
      return true
    }
    function cleanSvgState() {
      removeFlowOverlay()
      svg.removeAttribute('data-lens-active')
      Array.prototype.forEach.call(
        svg.querySelectorAll('[data-lens-match], [data-lens-selected], [data-lens-peer]'),
        function (element) {
          element.removeAttribute('data-lens-match')
          element.removeAttribute('data-lens-selected')
          element.removeAttribute('data-lens-peer')
        },
      )
    }
    function renderKinds() {
      kindsRoot.textContent = ''
      collectKinds().forEach(function (kind) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'semantic-lens-kind'
        button.setAttribute('data-kind', kind.id)
        button.setAttribute('aria-pressed', selectedKinds.indexOf(kind.id) >= 0 ? 'true' : 'false')
        button.setAttribute(
          'aria-label',
          viewerCount('viewer.lens.kind.count', kind.nodes.length, { label: kind.label }),
        )
        button.disabled = selectedKinds.length >= 2 && selectedKinds.indexOf(kind.id) === -1
        const swatch = document.createElement('span')
        swatch.className = 'semantic-lens-swatch'
        swatch.setAttribute('aria-hidden', 'true')
        const label = document.createElement('strong')
        label.textContent = kind.label
        const count = document.createElement('em')
        count.textContent = String(kind.nodes.length)
        button.appendChild(swatch)
        button.appendChild(label)
        button.appendChild(count)
        kindsRoot.appendChild(button)
      })
    }
    function updateHash() {
      try {
        const hash = selectedKinds.length ? '#lens=' + selectedKinds.map(encodeURIComponent).join('~') : ''
        history.replaceState(null, '', location.pathname + location.search + hash)
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    function updateTrigger() {
      const active = selectedKinds.length > 0
      trigger.setAttribute('aria-pressed', active ? 'true' : 'false')
      trigger.setAttribute('aria-label', viewerText(active ? 'viewer.lens.openActive' : 'viewer.lens.open'))
      copyBtn.hidden = !active
      syncLegendBridge()
    }
    function overlapArea(a, b) {
      const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      return width * height
    }
    function dockPanel(byId) {
      panel.removeAttribute('data-dock-side')
      if (panel.hidden || browser.innerWidth <= 720) return 'right'
      const panelRect = panel.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      if (!panelRect.width || !panelRect.height) return 'right'
      const selectedRects = Object.keys(byId)
        .filter(function (id) {
          return selectedKinds.indexOf(byId[id].getAttribute('data-node-kind') || 'neutral') >= 0
        })
        .map(function (id) {
          return byId[id].getBoundingClientRect()
        })
      const top = panelRect.top
      const width = panelRect.width
      const leftCandidate = {
        bottom: panelRect.bottom,
        left: containerRect.left + 16,
        right: containerRect.left + 16 + width,
        top,
      }
      const rightCandidate = {
        bottom: panelRect.bottom,
        left: containerRect.right - 16 - width,
        right: containerRect.right - 16,
        top,
      }
      let leftScore = selectedRects.reduce(function (score, rect) {
        return score + overlapArea(leftCandidate, rect)
      }, 0)
      let rightScore = selectedRects.reduce(function (score, rect) {
        return score + overlapArea(rightCandidate, rect)
      }, 0)
      const legend = svg.querySelector('[data-legend]')
      const nav = container.querySelector('.diagram-nav')
      const protectedRects = [legend, nav]
        .filter(function (element) {
          return element && !element.hidden && browser.getComputedStyle(element).display !== 'none'
        })
        .map(function (element) {
          return element.getBoundingClientRect()
        })
      leftScore += protectedRects.reduce(function (score, rect) {
        return score + overlapArea(leftCandidate, rect) * 1e3
      }, 0)
      rightScore += protectedRects.reduce(function (score, rect) {
        return score + overlapArea(rightCandidate, rect) * 1e3
      }, 0)
      const side = leftScore < rightScore ? 'left' : 'right'
      panel.setAttribute('data-dock-side', side)
      return side
    }
    function applySelection(options) {
      options = options || {}
      cleanSvgState()
      const byId = nodesById()
      const nodeKind = {}
      Object.keys(byId).forEach(function (id) {
        nodeKind[id] = byId[id].getAttribute('data-node-kind') || 'neutral'
      })
      if (!selectedKinds.length) {
        status.textContent = viewerText('viewer.lens.choose')
        updateTrigger()
        renderKinds()
        dockPanel(byId)
        if (options.updateUrl !== false) updateHash()
        return false
      }
      const chosen = {}
      selectedKinds.forEach(function (kind) {
        chosen[kind] = true
      })
      Object.keys(byId).forEach(function (id) {
        if (!chosen[nodeKind[id]]) return
        byId[id].setAttribute('data-lens-match', '')
        byId[id].setAttribute('data-lens-selected', '')
      })
      let touching = 0
      let forward = 0
      let reverse = 0
      const crossKind = selectedKinds.length === 2
      const matchedFlow = []
      edgeGroups().forEach(function (edge) {
        const fromKind = nodeKind[edge.from]
        const toKind = nodeKind[edge.to]
        let match = false
        if (crossKind) {
          if (fromKind === selectedKinds[0] && toKind === selectedKinds[1]) {
            match = true
            forward += 1
          }
          if (fromKind === selectedKinds[1] && toKind === selectedKinds[0]) {
            match = true
            reverse += 1
          }
        } else if (fromKind === selectedKinds[0] || toKind === selectedKinds[0]) {
          match = true
          touching += 1
        }
        if (!match) return
        let direction
        if (crossKind) {
          direction = fromKind === selectedKinds[0] ? 'forward' : 'reverse'
        } else {
          direction =
            fromKind === selectedKinds[0] && toKind !== selectedKinds[0]
              ? 'out'
              : toKind === selectedKinds[0] && fromKind !== selectedKinds[0]
                ? 'in'
                : 'within'
        }
        matchedFlow.push({ direction, edge })
        edge.members.forEach(function (member) {
          member.setAttribute('data-lens-match', '')
        })
        if (!crossKind) {
          ;[edge.from, edge.to].forEach(function (id) {
            if (!byId[id]) return
            byId[id].setAttribute('data-lens-match', '')
            if (!chosen[nodeKind[id]]) byId[id].setAttribute('data-lens-peer', '')
          })
        }
      })
      svg.setAttribute('data-lens-active', selectedKinds.join(' '))
      renderFlowOverlay(matchedFlow)
      if (crossKind) {
        const total = forward + reverse
        status.textContent = viewerCount('viewer.lens.compare', total, {
          first: viewerKindLabel(selectedKinds[0]),
          forward,
          reverse,
          second: viewerKindLabel(selectedKinds[1]),
        })
      } else {
        const nodeCount = collectKinds().filter(function (kind) {
          return kind.id === selectedKinds[0]
        })[0].nodes.length
        status.textContent = viewerText('viewer.lens.single', {
          nodes: viewerCount('viewer.lens.node', nodeCount, { label: viewerKindLabel(selectedKinds[0]) }),
          relationships: viewerCount('viewer.lens.relationship', touching),
        })
      }
      updateTrigger()
      renderKinds()
      dockPanel(byId)
      if (options.updateUrl !== false) updateHash()
      return true
    }
    function prepareForLens() {
      clearLegendPreview()
      if (Archify.focus && typeof Archify.focus.clear === 'function') {
        Archify.focus.clear({ preserveView: true, updateUrl: false })
      }
      if (Archify.routeProbe && typeof Archify.routeProbe.clear === 'function') {
        Archify.routeProbe.clear({ restoreFocus: false, updateUrl: false })
      }
      if (Archify.guidedViews && typeof Archify.guidedViews.showAll === 'function') {
        Archify.guidedViews.showAll({ clearFocus: false, updateUrl: false })
      }
      if (Archify.intentTrace && typeof Archify.intentTrace.clear === 'function') {
        Archify.intentTrace.clear({ announce: false })
      }
    }
    function select(kind, options) {
      options = options || {}
      clearLegendPreview()
      const exists = collectKinds().some(function (entry) {
        return entry.id === kind
      })
      if (!exists) return false
      const index = selectedKinds.indexOf(kind)
      if (index >= 0) selectedKinds.splice(index, 1)
      else {
        if (selectedKinds.length >= 2) return false
        if (!selectedKinds.length) prepareForLens()
        selectedKinds.push(kind)
      }
      return applySelection(options)
    }
    function close(options) {
      options = options || {}
      panel.hidden = true
      trigger.setAttribute('aria-expanded', 'false')
      updateTrigger()
      if (options.restoreFocus !== false && lensOpener && typeof lensOpener.focus === 'function') lensOpener.focus()
      return false
    }
    function open(options) {
      options = options || {}
      if (html.getAttribute('data-embed') === 'true') return false
      lensOpener = options.opener || trigger
      if (Archify.finder && Archify.finder.isOpen()) Archify.finder.close({ restoreFocus: false })
      if (Archify.radar && Archify.radar.isOpen()) Archify.radar.close({ restoreFocus: false })
      if (Archify.guide && Archify.guide.isOpen()) Archify.guide.close({ restoreFocus: false })
      renderKinds()
      panel.hidden = false
      trigger.setAttribute('aria-expanded', 'true')
      updateTrigger()
      requestAnimationFrame(function () {
        dockPanel(nodesById())
        const activeButton = kindsRoot.querySelector('[aria-pressed="true"]')
        const firstButton = activeButton || kindsRoot.querySelector('button:not(:disabled)')
        if (firstButton) firstButton.focus()
      })
      return true
    }
    function toggle() {
      return panel.hidden ? open({ opener: trigger }) : close()
    }
    function clear(options) {
      options = options || {}
      selectedKinds = []
      cleanSvgState()
      panel.removeAttribute('data-dock-side')
      updateTrigger()
      renderKinds()
      status.textContent = viewerText('viewer.lens.choose')
      if (options.updateUrl !== false) updateHash()
      if (options.preserveView !== true && Archify.view && typeof Archify.view.reset === 'function') {
        Archify.view.reset({ automatic: true })
      }
      if (options.closePanel === true) close({ restoreFocus: false })
      return false
    }
    function fallbackCopy(value) {
      const field = document.createElement('textarea')
      field.value = value
      field.setAttribute('readonly', '')
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.appendChild(field)
      field.select()
      let copied = false
      try {
        copied = document.execCommand('copy')
      } catch (_) {
        reportArchifyFailure(_)
      }
      field.remove()
      return copied
    }
    function copyLink() {
      if (!selectedKinds.length) return Promise.resolve(false)
      const value = location.href.replace(/#.*$/, '') + '#lens=' + selectedKinds.map(encodeURIComponent).join('~')
      const copy =
        browserNavigator.clipboard && typeof browserNavigator.clipboard.writeText === 'function'
          ? browserNavigator.clipboard
              .writeText(value)
              .then(function () {
                return true
              })
              .catch(function (error) {
                reportArchifyFailure(error)
                return fallbackCopy(value)
              })
          : Promise.resolve(fallbackCopy(value))
      return copy.then(function (copied) {
        copyBtn.textContent = viewerText(copied ? 'viewer.common.copied' : 'viewer.common.copyFailed')
        browser.setTimeout(function () {
          copyBtn.textContent = viewerText('viewer.common.copyLink')
        }, 1600)
        return copied
      })
    }
    function syncFromHash() {
      try {
        const params = new URLSearchParams(location.hash.replace(/^#/, ''))
        const value = params.get('lens')
        if (!value) {
          if (selectedKinds.length) clear({ preserveView: true, updateUrl: false })
          return
        }
        const available = collectKinds().map(function (kind) {
          return kind.id
        })
        const requested = value
          .split('~')
          .filter(function (kind, index, list) {
            return available.indexOf(kind) >= 0 && list.indexOf(kind) === index
          })
          .slice(0, 2)
        if (!requested.length) return
        prepareForLens()
        selectedKinds = requested
        applySelection({ updateUrl: false })
      } catch (_) {
        reportArchifyFailure(_)
      }
    }
    trigger.addEventListener('click', toggle)
    if (decorateLegendBridge()) {
      legendBridge.addEventListener('click', function (event) {
        const entry = event.target.closest('[data-legend-kind][role="button"]')
        if (entry) activateLegendEntry(entry)
      })
      legendBridge.addEventListener('pointerover', function (event) {
        if (event.pointerType === 'touch' || (finePointerQuery && !finePointerQuery.matches)) return
        const entry = event.target.closest('[data-legend-kind][role="button"]')
        if (!entry || (event.relatedTarget && entry.contains(event.relatedTarget))) return
        hoveredLegendEntry = entry
        syncLegendPreview()
      })
      legendBridge.addEventListener('pointerout', function (event) {
        const entry = event.target.closest('[data-legend-kind][role="button"]')
        if (!entry || (event.relatedTarget && entry.contains(event.relatedTarget))) return
        if (hoveredLegendEntry === entry) hoveredLegendEntry = null
        syncLegendPreview()
      })
      legendBridge.addEventListener('focusin', function (event) {
        const entry = event.target.closest('[data-legend-kind][role="button"]')
        if (!entry) return
        focusedLegendEntry = entry
        legendEntries.forEach(function (candidate) {
          candidate.setAttribute('tabindex', candidate === entry ? '0' : '-1')
        })
        syncLegendPreview()
      })
      legendBridge.addEventListener('focusout', function (event) {
        const entry = event.target.closest('[data-legend-kind][role="button"]')
        if (!entry || (event.relatedTarget && entry.contains(event.relatedTarget))) return
        if (focusedLegendEntry === entry) focusedLegendEntry = null
        syncLegendPreview()
      })
      legendBridge.addEventListener('keydown', function (event) {
        const entry = event.target.closest('[data-legend-kind][role="button"]')
        if (!entry) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activateLegendEntry(entry)
          return
        }
        const index = legendEntries.indexOf(entry)
        let next = null
        if (event.key === 'ArrowRight') next = (index + 1) % legendEntries.length
        else if (event.key === 'ArrowLeft') next = (index - 1 + legendEntries.length) % legendEntries.length
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = legendEntries.length - 1
        if (next === null) return
        event.preventDefault()
        legendEntries.forEach(function (candidate, candidateIndex) {
          candidate.setAttribute('tabindex', candidateIndex === next ? '0' : '-1')
        })
        legendEntries[next].focus()
      })
    }
    closeBtn.addEventListener('click', function () {
      close()
    })
    clearBtn.addEventListener('click', function () {
      clear({ preserveView: true })
    })
    copyBtn.addEventListener('click', copyLink)
    kindsRoot.addEventListener('click', function (event) {
      const button = event.target.closest('[data-kind]')
      if (!button || button.disabled) return
      select(button.getAttribute('data-kind'))
    })
    kindsRoot.addEventListener('keydown', function (event) {
      const buttons = Array.prototype.slice.call(kindsRoot.querySelectorAll('button:not(:disabled)'))
      const index = buttons.indexOf(document.activeElement)
      let next = null
      if (index >= 0 && (event.key === 'ArrowRight' || event.key === 'ArrowDown')) next = (index + 1) % buttons.length
      else if (index >= 0 && (event.key === 'ArrowLeft' || event.key === 'ArrowUp'))
        next = (index - 1 + buttons.length) % buttons.length
      else if (event.key === 'Home' && buttons.length) next = 0
      else if (event.key === 'End' && buttons.length) next = buttons.length - 1
      if (next !== null) {
        event.preventDefault()
        buttons[next].focus()
      }
    })
    panel.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      close()
    })
    document.addEventListener('click', function (event) {
      const eventPath = typeof event.composedPath === 'function' ? event.composedPath() : []
      const clickedInside = eventPath.indexOf(panel) >= 0 || panel.contains(event.target)
      const clickedLauncher =
        event.target === trigger ||
        legendEntries.some(function (entry) {
          return event.target === entry || entry.contains(event.target)
        })
      if (!panel.hidden && !clickedInside && !clickedLauncher) close({ restoreFocus: false })
    })
    browser.addEventListener('hashchange', syncFromHash)
    browser.addEventListener('resize', function () {
      if (!panel.hidden && selectedKinds.length) dockPanel(nodesById())
      layoutLegendBridge()
    })
    renderKinds()
    syncFromHash()
    return {
      active: function () {
        return selectedKinds.length ? selectedKinds.slice() : null
      },
      clear,
      clearPreview: clearLegendPreview,
      close,
      copyLink,
      isOpen: function () {
        return !panel.hidden
      },
      kinds: function () {
        return collectKinds().map(function (kind) {
          return { count: kind.nodes.length, id: kind.id }
        })
      },
      open,
      select,
      toggle,
    }
  })()
  Archify.guide = (function () {
    const html = document.documentElement
    const container = document.querySelector('.diagram-container')
    const svg = container.querySelector(':scope > svg')
    const trigger = document.getElementById('btn-diagram-guide')
    const panel = document.getElementById('diagram-guide')
    const closeBtn = document.getElementById('diagram-guide-close')
    const stats = document.getElementById('diagram-guide-stats')
    const actions = document.getElementById('diagram-guide-actions')
    const feedback = document.getElementById('diagram-guide-feedback')
    const storyBtn = actions.querySelector('[data-guide-action="story"]')
    const storyCopy = document.getElementById('diagram-guide-story-copy')
    const routePanel = document.getElementById('route-probe')
    function viewCount() {
      return (Archify.guidedViews && Number(Archify.guidedViews.count)) || 0
    }
    function relationshipCount() {
      const seen = {}
      Array.prototype.forEach.call(svg.querySelectorAll('[data-edge-from][data-edge-to]'), function (edge) {
        const key =
          edge.getAttribute('data-edge-key') ||
          [
            edge.getAttribute('data-edge-from'),
            edge.getAttribute('data-edge-to'),
            edge.getAttribute('data-edge-label') || '',
          ].join('\0')
        seen[key] = true
      })
      return Object.keys(seen).length
    }
    function renderFacts() {
      const nodes = svg.querySelectorAll('[data-node-id]').length
      const relationships = relationshipCount()
      const views = viewCount()
      stats.textContent = viewerText('viewer.guide.facts', {
        nodes: viewerCount('viewer.guide.fact.node', nodes),
        relationships: viewerCount('viewer.guide.fact.relationship', relationships),
        views: viewerCount('viewer.guide.fact.view', views),
      })
      storyBtn.disabled = views === 0
      storyBtn.setAttribute('aria-disabled', views === 0 ? 'true' : 'false')
      storyCopy.textContent = views
        ? viewerCount('viewer.guide.story.available', views)
        : viewerText('viewer.guide.story.unavailable')
    }
    function actionButtons() {
      return Array.prototype.slice.call(actions.querySelectorAll('.diagram-guide-action:not(:disabled)'))
    }
    function close(options) {
      options = options || {}
      panel.hidden = true
      html.removeAttribute('data-guide-open')
      routePanel.removeAttribute('data-guide-open')
      trigger.setAttribute('aria-expanded', 'false')
      trigger.setAttribute('aria-label', viewerText('viewer.guide.open'))
      feedback.textContent = ''
      if (options.restoreFocus !== false) trigger.focus()
      return false
    }
    function open() {
      if (html.getAttribute('data-embed') === 'true') return false
      if (Archify.semanticLens && typeof Archify.semanticLens.clearPreview === 'function')
        Archify.semanticLens.clearPreview()
      if (Archify.finder && Archify.finder.isOpen()) Archify.finder.close({ restoreFocus: false })
      if (Archify.radar && Archify.radar.isOpen()) Archify.radar.close({ restoreFocus: false })
      if (Archify.semanticLens && Archify.semanticLens.isOpen()) Archify.semanticLens.close({ restoreFocus: false })
      if (Archify.guidedViews && Archify.guidedViews.isPlaying && Archify.guidedViews.isPlaying()) {
        Archify.guidedViews.pause()
      }
      if (Archify.routeProbe && Archify.routeProbe.isJourneyPlaying && Archify.routeProbe.isJourneyPlaying()) {
        Archify.routeProbe.pauseJourney({ preserveElapsed: true, reason: 'guide' })
      }
      renderFacts()
      panel.hidden = false
      html.setAttribute('data-guide-open', 'true')
      routePanel.setAttribute('data-guide-open', 'true')
      trigger.setAttribute('aria-expanded', 'true')
      trigger.setAttribute('aria-label', viewerText('viewer.guide.close'))
      feedback.textContent = ''
      requestAnimationFrame(function () {
        const first = actionButtons()[0]
        if (first) first.focus()
      })
      return true
    }
    function toggle() {
      return panel.hidden ? open() : close()
    }
    function execute(action) {
      feedback.textContent = ''
      if (action === 'story' && !viewCount()) {
        feedback.textContent = viewerText('viewer.guide.noStory')
        return false
      }
      close({ restoreFocus: false })
      if (action === 'find') return Archify.finder.open()
      if (action === 'route') return Archify.routeProbe.begin({ focusNode: true })
      if (action === 'map') return Archify.radar.open()
      if (action === 'lens') return Archify.semanticLens.open()
      if (action === 'story') return Archify.guidedViews.play()
      if (action === 'present') return Archify.presentation.enter()
      if (action === 'theme') return Archify.theme.toggle()
      if (action === 'reset') return Archify.view.reset()
      if (action === 'zoom-in') return Archify.view.zoomIn()
      if (action === 'zoom-out') return Archify.view.zoomOut()
      return false
    }
    function actionForKey(key) {
      return (
        {
          0: 'reset',
          '+': 'zoom-in',
          '-': 'zoom-out',
          '/': 'find',
          '=': 'zoom-in',
          e: 'export',
          f: 'present',
          l: 'lens',
          m: 'map',
          p: 'story',
          r: 'route',
          s: 'preset',
          t: 'theme',
        }[key] || null
      )
    }
    trigger.addEventListener('click', toggle)
    closeBtn.addEventListener('click', function () {
      close()
    })
    actions.addEventListener('click', function (event) {
      const button = event.target.closest('[data-guide-action]')
      if (!button || button.disabled) return
      event.stopPropagation()
      execute(button.getAttribute('data-guide-action'))
    })
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }
      const buttons = actionButtons()
      const index = buttons.indexOf(document.activeElement)
      let next = null
      if (index >= 0 && event.key === 'ArrowRight') next = (index + 1) % buttons.length
      else if (index >= 0 && event.key === 'ArrowDown') next = (index + 1) % buttons.length
      else if (index >= 0 && event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length
      else if (index >= 0 && event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length
      else if (event.key === 'Home' && buttons.length) next = 0
      else if (event.key === 'End' && buttons.length) next = buttons.length - 1
      if (next !== null) {
        event.preventDefault()
        event.stopPropagation()
        buttons[next].focus()
        return
      }
      const action = actionForKey(event.key.length === 1 ? event.key.toLowerCase() : event.key)
      if (!action) return
      event.preventDefault()
      event.stopPropagation()
      execute(action)
    })
    document.addEventListener('click', function (event) {
      if (!panel.hidden && !panel.contains(event.target) && event.target !== trigger) close({ restoreFocus: false })
    })
    renderFacts()
    return {
      close,
      execute,
      facts: function () {
        return {
          nodes: svg.querySelectorAll('[data-node-id]').length,
          relationships: relationshipCount(),
          views: viewCount(),
        }
      },
      isOpen: function () {
        return !panel.hidden
      },
      open,
      toggle,
    }
  })()
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.defaultPrevented) return
    const t = e.target
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    if (e.key === '?') {
      e.preventDefault()
      Archify.guide.toggle()
    } else if (e.key === '/') {
      e.preventDefault()
      Archify.finder.open()
    } else if (e.key === 't' || e.key === 'T') {
      e.preventDefault()
      Archify.theme.toggle()
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      Archify.presentation.toggle()
    } else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault()
      Archify.radar.toggle()
    } else if (e.key === 'l' || e.key === 'L') {
      e.preventDefault()
      Archify.semanticLens.toggle()
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault()
      Archify.routeProbe.toggle({ focusNode: true })
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      Archify.view.zoomIn()
    } else if (e.key === '-') {
      e.preventDefault()
      Archify.view.zoomOut()
    } else if (e.key === '0') {
      e.preventDefault()
      Archify.view.reset()
    } else if (e.key === 'Escape' && Archify.semanticLens.isOpen()) {
      e.preventDefault()
      Archify.semanticLens.close({ restoreFocus: true })
    } else if (e.key === 'Escape' && Archify.semanticLens.active()) {
      e.preventDefault()
      Archify.semanticLens.clear({ preserveView: true })
    } else if (e.key === 'Escape' && Archify.guide.isOpen()) {
      e.preventDefault()
      Archify.guide.close({ restoreFocus: true })
    } else if (e.key === 'Escape' && Archify.radar.isOpen()) {
      e.preventDefault()
      Archify.radar.close({ restoreFocus: true })
    } else if (e.key === 'Escape' && Archify.routeProbe.active()) {
      e.preventDefault()
      Archify.routeProbe.escape({ restoreFocus: true })
    } else if (e.key === 'Escape' && Archify.intentTrace.active()) {
      e.preventDefault()
      Archify.intentTrace.clear()
    } else if (e.key === 'Escape' && Archify.focus.active()) {
      e.preventDefault()
      Archify.focus.clear({ restoreFocus: true })
    } else if (e.key === 'Escape' && Archify.presentation.active()) {
      e.preventDefault()
      Archify.presentation.exit()
    }
  })
  return Archify
}
export { mountArchifyRuntime }
