workspace "Name" "Description"

    !identifiers hierarchical

    model {
        u = person "User"
        ss = softwareSystem "Bulk Video Reviewer" {
            wa = container "Web Application" {
                tags "Web Application"
                c1 = component "comp"
            }
            addVideo = container "Add Video Use Case" "Handles the addition of new videos" {
                tags "Use Case"
            }
            MetadataExtractor = container "Metadata Extractor" "Extracts metadata from videos" {
                tags "Component"
            }
            VideoProcessingFactory = container "Video Processing Factory" "Creates video processing components" {
                tags "Component"
            }
            DOMVideoProcessing = container "HTML DOM Video Processing" "Processes videos using HTML DOM methods" {
                tags "Component"
            }
            FFMPEGVideoProcessing = container "FFMPEG Video Processing" "Processes videos using FFMPEG" {
                tags "Component"
            }
            StorageAdapter = container "Storage Adapter" "Adapts storage operations" {
                tags "Component"
            }

            db = container "LocalStorage Database" "Stores video metadata and related information" {
                tags "Database"
            }
        }

        u -> ss.wa "Uses"
        ss.wa -> ss.addVideo "Submits video"
        ss.addVideo -> ss.MetadataExtractor "Uses"
        ss.MetadataExtractor -> ss.VideoProcessingFactory "Uses"
        ss.VideoProcessingFactory -> ss.DOMVideoProcessing "Provides"
        ss.VideoProcessingFactory -> ss.FFMPEGVideoProcessing "Provides"
        
        // Storage
        ss.addVideo -> ss.StorageAdapter "Uses"
        ss.StorageAdapter -> ss.db "Reads from and writes to"
    }

    views {
        systemContext ss "Diagram1" {
            include *
            autolayout lr
        }

        container ss "Diagram2" {
            include *
            autolayout lr
        }

        styles {
            element "Element" {
                color #0773af
                stroke #0773af
                strokeWidth 7
                shape roundedbox
            }
            element "Person" {
                shape person
            }
            element "Boundary" {
                strokeWidth 5
            }
            relationship "Relationship" {
                thickness 4
            }
            element "Web Application" {
                shape WebBrowser
            }
            element "Database" {
                shape Cylinder
            }
            element "Use Case" {
                shape Hexagon
            }
        }
    }
