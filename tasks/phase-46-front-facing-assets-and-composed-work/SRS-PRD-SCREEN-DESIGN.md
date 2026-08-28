# SRS / PRD / screen design

## Runtime composition

Working is represented by three independent entities: the actor sprite, its assigned chair, and its assigned desk. The actor snaps to the workstation interaction point and renders behind the desk front edge. No work frame may contain a desk, laptop, chair, or other furniture.

## Asset projection

Tall furniture uses a centered front elevation. Horizontal furniture uses a straight cardinal top-down/front hybrid. Asset bounds include transparent safety padding and retain independent collision footprints.

## Floor palette

The editor floor palette includes `office-carpet-tile-v1.png`. Selecting it replaces the single full-office floor layer.
