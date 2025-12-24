# 2D RPG Project Summary - LLM-Enhanced World Building

## Project Goal
Create a 2D tile-based RPG world (using Tiled and Phaser) that feels "rich and alive and interesting to interact with" by leveraging LLMs for abundant content generation while maintaining deterministic game state.

## Core Philosophy
- Use LLMs for **authoring-time content generation**, not runtime procedural generation
- Generate traditional assets and world logic that get baked into Tiled maps
- Create depth that would be infeasible for a solo developer through abundance of interactions

## LLM Strategy

### Strengths to Leverage
- **Abundant Interactions**: Generate hundreds of contextual interactions for objects that games typically ignore
- **Interconnected Systems**: Create NPC knowledge networks, item combinations, environmental reactions
- **Variant Content**: Multiple dialogue variations, branching failure states, contextual hints
- **World Coherence**: Generate consistent lore, backstories, and connecting narrative threads

### Technical Approach
1. **Static Generation**: LLMs generate content that becomes Tiled map data
2. **Property-Driven**: All generated content stored as custom properties in Tiled
3. **Phaser Interpretation**: Game code reads properties to instantiate behaviors at runtime

### Example Workflow
```
LLM generates → Tiled custom properties → Export to JSON → Phaser reads & interprets
```

## Identified Pitfalls
- **Coherence Drift**: Solution - Generate world bible first, validate all content
- **Sameness in Variety**: Solution - Force diversity through structured prompts
- **Player Overwhelm**: Solution - Gate complexity, teach interaction language gradually
- **Technical Debt**: Solution - Define clear property schema early
- **Memory Budget**: Solution - Streaming/lazy loading of areas

## Current Development Stage
- Basic character movement on static tilemap with buildings/trees/fences
- No interaction system yet implemented

## Next Milestone: Basic Interaction System

### 1. Interaction Framework
**Phaser Implementation:**
- Add spacebar/action button detection
- Check for nearby interactable objects based on player facing direction
- Create visual feedback system (outline highlight or indicator sprite)
- Implement text display UI component

**Tiled Setup:**
- Add custom property `interactable: true` to objects
- Define interaction ranges with object bounds or `interactionRange` property
- Store interaction data in custom properties

### 2. Three Proof-of-Concept Interactions

**A. Examine Interaction**
- *Tiled*: Add `examineText` property to objects (e.g., "An old well. The rope looks frayed.")
- *Phaser*: Display text when player interacts with object

**B. State Change Interaction**
- *Tiled*: Create door object with `state: "closed"` and `alternateState: "open"` properties
- *Phaser*: Toggle between states, update collision and sprite/tile

**C. Pickup Interaction**
- *Tiled*: Create item objects with `pickupItem: "coin"` and `value: 1` properties
- *Phaser*: Remove object from world, increment player inventory counter

### 3. Technical Implementation Notes

**Visual Feedback Division:**
- *Tiled*: Marks WHAT is interactable (data only)
- *Phaser*: Shows HOW it's interactable (runtime visuals)

**Text System Division:**
- *Tiled*: Stores text content and display metadata
- *Phaser*: Handles UI rendering, positioning, animations

## Future Progression Path
1. Current: Basic interaction system
2. Next: NPCs with static dialogue
3. Then: Simple inventory system
4. Then: NPCs with state/memory
5. Then: Object-to-object interactions
6. Finally: LLM-generated abundance within proven framework

## Key Success Metric
Once basic interactions work, we can test: "Does generating 50 variations instead of 3 actually improve the player experience?" This grounds the abundance strategy in real feedback.